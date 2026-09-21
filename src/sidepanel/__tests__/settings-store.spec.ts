import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const store: Record<string, unknown> = {};
const mockSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          list.filter((k) => store[k] !== undefined).map((k) => [k, store[k]]),
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
    },
  },
  runtime: { sendMessage: mockSendMessage },
});

import {
  ollamaConfig,
  modelList,
  loadSettings,
  saveSettings,
  addModel,
  removeModel,
  setActiveModel,
  setNewsModel,
  newsModel,
  effectiveSummaryModel,
  setWorkflowModel,
  workflowModel,
  effectiveWorkflowModel,
  testModel,
} from '../stores/settings';

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  mockSendMessage.mockReset();
  ollamaConfig.set(null);
  modelList.set([]);
  newsModel.set('');
  workflowModel.set('');
});

describe('loadSettings', () => {
  it('falls back to the Ollama defaults on a fresh profile', async () => {
    await loadSettings();
    expect(get(ollamaConfig)).toEqual({ baseUrl: 'http://localhost:11434', model: 'gemma4:12b' });
  });

  it('seeds the model list from the active model when no list is stored', async () => {
    store.ollama = { baseUrl: 'http://localhost:11434', model: 'phi3' };
    await loadSettings();
    expect(get(modelList)).toEqual(['phi3']);
  });

  it('prefers the stored model list over the active model', async () => {
    store.ollama = { baseUrl: 'http://localhost:11434', model: 'phi3' };
    store.models = ['llama3.2', 'qwen3:8b'];
    await loadSettings();
    expect(get(modelList)).toEqual(['llama3.2', 'qwen3:8b']);
  });

  it('never asks Ollama which models exist', async () => {
    await loadSettings();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('persists the ollama config', async () => {
    await saveSettings({ baseUrl: 'http://custom:11434', model: 'mistral' });
    expect(store.ollama).toEqual({ baseUrl: 'http://custom:11434', model: 'mistral' });
    expect(get(ollamaConfig)?.model).toBe('mistral');
  });

  // The retired search key must never be written back by the settings UI.
  it('does not write the retired search key', async () => {
    await saveSettings({ baseUrl: 'http://custom:11434', model: 'mistral' });
    expect(store.search).toBeUndefined();
  });
});

describe('addModel', () => {
  beforeEach(async () => {
    await loadSettings();
    modelList.set([]);
  });

  it('trims whitespace around the name', async () => {
    await addModel('  qwen3:8b  ');
    expect(get(modelList)).toEqual(['qwen3:8b']);
    expect(store.models).toEqual(['qwen3:8b']);
  });

  it('ignores a blank name', async () => {
    await addModel('   ');
    expect(get(modelList)).toEqual([]);
  });

  it('ignores a duplicate', async () => {
    await addModel('phi3');
    await addModel('phi3');
    expect(get(modelList)).toEqual(['phi3']);
  });

  it('does not validate the name against Ollama', async () => {
    await addModel('not-a-real-model');
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(get(modelList)).toEqual(['not-a-real-model']);
  });

  it('makes the first model active when none is set', async () => {
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: '' });
    await addModel('phi3');
    expect(get(ollamaConfig)?.model).toBe('phi3');
  });
});

describe('removeModel', () => {
  beforeEach(async () => {
    await loadSettings();
    modelList.set(['llama3.2', 'phi3']);
    store.models = ['llama3.2', 'phi3'];
  });

  it('drops the model from the list', async () => {
    await removeModel('phi3');
    expect(get(modelList)).toEqual(['llama3.2']);
    expect(store.models).toEqual(['llama3.2']);
  });

  it('reassigns the active model when the active one is removed', async () => {
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'phi3' });
    await removeModel('phi3');
    expect(get(ollamaConfig)?.model).toBe('llama3.2');
  });

  it('clears the active model when the last one is removed', async () => {
    modelList.set(['phi3']);
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'phi3' });
    await removeModel('phi3');
    expect(get(ollamaConfig)?.model).toBe('');
  });

  it('leaves the active model alone when another is removed', async () => {
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    await removeModel('phi3');
    expect(get(ollamaConfig)?.model).toBe('llama3.2');
  });
});

describe('setActiveModel', () => {
  it('persists the new active model', async () => {
    await loadSettings();
    await setActiveModel('qwen3:8b');
    expect(get(ollamaConfig)?.model).toBe('qwen3:8b');
    expect(store.ollama).toMatchObject({ model: 'qwen3:8b' });
  });
});

describe('testModel', () => {
  it('sends TEST_MODEL and returns the latency on success', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, latencyMs: 412 });
    const result = await testModel('llama3.2');
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'TEST_MODEL', model: 'llama3.2' });
    expect(result).toEqual({ ok: true, latencyMs: 412 });
  });

  it('surfaces the error string rather than swallowing it', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'model "x" not found' });
    expect(await testModel('x')).toEqual({ ok: false, error: 'model "x" not found' });
  });

  it('reports a thrown sendMessage failure', async () => {
    mockSendMessage.mockRejectedValue(new Error('service worker asleep'));
    expect(await testModel('x')).toEqual({ ok: false, error: 'service worker asleep' });
  });

  it('reports a missing response', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const result = await testModel('x');
    expect(result.ok).toBe(false);
  });
});

describe('newsModel', () => {
  it("loadSettings defaults the News model to '' on a fresh profile", async () => {
    await loadSettings();
    expect(get(newsModel)).toBe('');
  });

  it('loadSettings hydrates the News model from the newsConfig key', async () => {
    store.newsConfig = { model: 'phi4' };
    await loadSettings();
    expect(get(newsModel)).toBe('phi4');
  });

  it('setNewsModel persists to newsConfig and leaves the chat model alone', async () => {
    await loadSettings();
    await setNewsModel('phi4');

    expect(get(newsModel)).toBe('phi4');
    expect(store.newsConfig).toEqual({ model: 'phi4' });
    expect(store.ollama).toBeUndefined();
    expect(get(ollamaConfig)?.model).toBe('gemma4:12b');
  });

  it("setNewsModel('') persists the follow-the-chat-model state", async () => {
    store.newsConfig = { model: 'phi4' };
    await loadSettings();
    await setNewsModel('');

    expect(get(newsModel)).toBe('');
    expect(store.newsConfig).toEqual({ model: '' });
  });

  it('setNewsModel writes nothing when the value is unchanged', async () => {
    store.newsConfig = { model: 'phi4' };
    await loadSettings();
    delete store.newsConfig;

    await setNewsModel('phi4');

    expect(store.newsConfig).toBeUndefined();
  });
});

describe('effectiveSummaryModel', () => {
  it("follows the chat model while the News preference is ''", async () => {
    await loadSettings();
    expect(get(effectiveSummaryModel)).toBe('gemma4:12b');
  });

  it('is the News preference once one is set', async () => {
    await loadSettings();
    await setNewsModel('phi4');
    expect(get(effectiveSummaryModel)).toBe('phi4');
  });

  it('tracks the chat model changing while following it', async () => {
    await loadSettings();
    await setActiveModel('qwen3:8b');
    expect(get(effectiveSummaryModel)).toBe('qwen3:8b');
  });

  it('ignores the chat model changing once an override is set', async () => {
    await loadSettings();
    await setNewsModel('phi4');
    await setActiveModel('qwen3:8b');
    expect(get(effectiveSummaryModel)).toBe('phi4');
  });
});

describe('removeModel reconciles the News preference', () => {
  beforeEach(async () => {
    await loadSettings();
    modelList.set(['llama3.2', 'phi3']);
    store.models = ['llama3.2', 'phi3'];
  });

  // '' rather than updated[0]: silently summarizing with a model the user never picked
  // is worse than visibly falling back to the one they can see in Settings.
  it("resets the News model to '' when the selected one is removed", async () => {
    await setNewsModel('phi3');
    await removeModel('phi3');

    expect(get(newsModel)).toBe('');
    expect(store.newsConfig).toEqual({ model: '' });
  });

  it('leaves the News model alone when another model is removed', async () => {
    await setNewsModel('llama3.2');
    await removeModel('phi3');

    expect(get(newsModel)).toBe('llama3.2');
  });
});

describe('workflowModel', () => {
  it("loadSettings defaults the Workflows model to '' on a fresh profile", async () => {
    await loadSettings();
    expect(get(workflowModel)).toBe('');
  });

  it('loadSettings hydrates the Workflows model from the workflowsConfig key', async () => {
    store.workflowsConfig = { playbook: 'toptal', model: 'phi4' };
    await loadSettings();
    expect(get(workflowModel)).toBe('phi4');
  });

  it('setWorkflowModel persists to workflowsConfig and leaves the chat model alone', async () => {
    await loadSettings();
    await setWorkflowModel('phi4');

    expect(get(workflowModel)).toBe('phi4');
    expect(store.workflowsConfig).toEqual({ playbook: '', model: 'phi4' });
    expect(store.ollama).toBeUndefined();
    expect(get(ollamaConfig)?.model).toBe('gemma4:12b');
  });

  // The playbook shares this key and belongs to `stores/playbook.ts`; a replacing write
  // here would put the Workflows tab back on the default playbook without saying so.
  it('setWorkflowModel preserves the selected playbook', async () => {
    store.workflowsConfig = { playbook: 'toptal', model: '' };
    await loadSettings();
    await setWorkflowModel('phi4');

    expect(store.workflowsConfig).toEqual({ playbook: 'toptal', model: 'phi4' });
  });

  it('setWorkflowModel leaves the News preference alone', async () => {
    store.newsConfig = { model: 'llama3.2' };
    await loadSettings();
    await setWorkflowModel('phi4');

    expect(store.newsConfig).toEqual({ model: 'llama3.2' });
    expect(get(newsModel)).toBe('llama3.2');
  });

  it("setWorkflowModel('') persists the follow-the-chat-model state", async () => {
    store.workflowsConfig = { playbook: 'toptal', model: 'phi4' };
    await loadSettings();
    await setWorkflowModel('');

    expect(get(workflowModel)).toBe('');
    expect(store.workflowsConfig).toEqual({ playbook: 'toptal', model: '' });
  });

  it('setWorkflowModel writes nothing when the value is unchanged', async () => {
    store.workflowsConfig = { playbook: 'toptal', model: 'phi4' };
    await loadSettings();
    delete store.workflowsConfig;

    await setWorkflowModel('phi4');

    expect(store.workflowsConfig).toBeUndefined();
  });
});

describe('effectiveWorkflowModel', () => {
  it("follows the chat model while the Workflows preference is ''", async () => {
    await loadSettings();
    expect(get(effectiveWorkflowModel)).toBe('gemma4:12b');
  });

  it('is the Workflows preference once one is set', async () => {
    await loadSettings();
    await setWorkflowModel('phi4');
    expect(get(effectiveWorkflowModel)).toBe('phi4');
  });

  it('tracks the chat model changing while following it', async () => {
    await loadSettings();
    await setActiveModel('qwen3:8b');
    expect(get(effectiveWorkflowModel)).toBe('qwen3:8b');
  });

  it('ignores the chat model changing once an override is set', async () => {
    await loadSettings();
    await setWorkflowModel('phi4');
    await setActiveModel('qwen3:8b');
    expect(get(effectiveWorkflowModel)).toBe('phi4');
  });

  // Two surfaces, two preferences: News summarizing on a small model must not drag the
  // drafting model down with it.
  it('is independent of the News preference', async () => {
    await loadSettings();
    await setNewsModel('llama3.2');
    await setWorkflowModel('phi4');

    expect(get(effectiveWorkflowModel)).toBe('phi4');
    expect(get(effectiveSummaryModel)).toBe('llama3.2');
  });
});

describe('removeModel reconciles the Workflows preference', () => {
  beforeEach(async () => {
    await loadSettings();
    modelList.set(['llama3.2', 'phi3']);
    store.models = ['llama3.2', 'phi3'];
  });

  // Same reasoning as the News preference, and it matters more here: a drafting model
  // the user never picked writes answers a recruiter reads.
  it("resets the Workflows model to '' when the selected one is removed", async () => {
    await setWorkflowModel('phi3');
    await removeModel('phi3');

    expect(get(workflowModel)).toBe('');
    expect(store.workflowsConfig).toEqual({ playbook: '', model: '' });
  });

  it('leaves the Workflows model alone when another model is removed', async () => {
    await setWorkflowModel('llama3.2');
    await removeModel('phi3');

    expect(get(workflowModel)).toBe('llama3.2');
  });
});
