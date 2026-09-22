// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getChatConfig,
  setChatConfig,
  getOllamaConfig,
  setOllamaConfig,
  getModelList,
  setModelList,
  getNewsConfig,
  setNewsConfig,
  getWorkflowsConfig,
  setWorkflowsConfig,
  getAvailability,
  setAvailability,
  getTavilyConfig,
  setTavilyConfig,
  getLinkedInConfig,
  setLinkedInConfig,
  getLoveNoteConfig,
  setLoveNoteConfig,
} from '../storage';
import type { ChatConfig, NewsConfig, TavilyConfig } from '../storage';
import type { OllamaConfig } from '../../types';

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
    },
  },
});

describe('getChatConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // '' is "no override" — the packaged src/prompts/system.md is the default now,
  // so storage must not carry a copy of it.
  it("returns '' when storage has no chat key", async () => {
    mockGet.mockResolvedValue({});
    const config = await getChatConfig();
    expect(config.systemPrompt).toBe('');
  });

  it('returns the stored override', async () => {
    const stored: ChatConfig = { systemPrompt: 'Custom prompt' };
    mockGet.mockResolvedValue({ chat: stored });
    const config = await getChatConfig();
    expect(config.systemPrompt).toBe('Custom prompt');
  });

  it('reads from the "chat" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getChatConfig();
    expect(mockGet).toHaveBeenCalledWith('chat');
  });

  it('preserves all fields from stored config', async () => {
    const stored: ChatConfig = { systemPrompt: 'My assistant' };
    mockGet.mockResolvedValue({ chat: stored });
    const config = await getChatConfig();
    expect(config).toMatchObject(stored);
  });
});

describe('setChatConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the "chat" storage key', async () => {
    const config: ChatConfig = { systemPrompt: 'Be brief.' };
    await setChatConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ chat: config });
  });

  it('persists the exact config object passed', async () => {
    const config: ChatConfig = { systemPrompt: 'You are a pirate.' };
    await setChatConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ chat: config });
  });
});

describe('setOllamaConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the ollama storage key', async () => {
    const cfg: OllamaConfig = { baseUrl: 'http://custom:11434', model: 'mistral' };
    await setOllamaConfig(cfg);
    expect(mockSet).toHaveBeenCalledWith({ ollama: cfg });
  });
});

describe('getModelList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty array on a fresh profile', async () => {
    mockGet.mockResolvedValue({});
    expect(await getModelList()).toEqual([]);
  });

  it('returns the stored list', async () => {
    mockGet.mockResolvedValue({ models: ['llama3.2', 'qwen3:8b'] });
    expect(await getModelList()).toEqual(['llama3.2', 'qwen3:8b']);
  });

  it('ignores a non-array value', async () => {
    mockGet.mockResolvedValue({ models: { ollama: ['llama3.2'] } });
    expect(await getModelList()).toEqual([]);
  });
});

describe('setModelList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the models storage key', async () => {
    await setModelList(['phi3']);
    expect(mockSet).toHaveBeenCalledWith({ models: ['phi3'] });
  });
});

describe('getOllamaConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('still returns OllamaConfig from the ollama key after Sprint 1 changes', async () => {
    mockGet.mockResolvedValue({ ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' } });
    const config = await getOllamaConfig();
    expect(config.baseUrl).toBe('http://localhost:11434');
    expect(config.model).toBe('llama3.2');
  });
});

describe('getNewsConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns '' on a fresh profile, i.e. follow the active model", async () => {
    mockGet.mockResolvedValue({});
    expect(await getNewsConfig()).toEqual({ model: '' });
  });

  it('returns the stored model', async () => {
    mockGet.mockResolvedValue({ newsConfig: { model: 'phi4' } });
    expect(await getNewsConfig()).toEqual({ model: 'phi4' });
  });

  it('reads from the "newsConfig" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getNewsConfig();
    expect(mockGet).toHaveBeenCalledWith('newsConfig');
  });

  it('tolerates a non-object stored value', async () => {
    mockGet.mockResolvedValue({ newsConfig: 'phi4' });
    expect(await getNewsConfig()).toEqual({ model: '' });
  });
});

describe('setNewsConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes to the "newsConfig" storage key', async () => {
    const config: NewsConfig = { model: 'phi4' };
    await setNewsConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ newsConfig: config });
  });

  // The `news` key is the article cache and is replaced wholesale on every refresh, so a
  // preference written there would not survive the next Refresh press.
  it('never touches the "news" cache key', async () => {
    await setNewsConfig({ model: 'phi4' });
    expect(Object.keys(mockSet.mock.calls[0]?.[0] ?? {})).toEqual(['newsConfig']);
  });

  it("persists '' so the News tab can go back to the active model", async () => {
    await setNewsConfig({ model: '' });
    expect(mockSet).toHaveBeenCalledWith({ newsConfig: { model: '' } });
  });
});

describe('getWorkflowsConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns '' for both fields on a fresh profile", async () => {
    mockGet.mockResolvedValue({});
    expect(await getWorkflowsConfig()).toEqual({ playbook: '', model: '' });
  });

  it('returns the stored playbook and model', async () => {
    mockGet.mockResolvedValue({ workflowsConfig: { playbook: 'toptal', model: 'phi4' } });
    expect(await getWorkflowsConfig()).toEqual({ playbook: 'toptal', model: 'phi4' });
  });

  // The model field was added after the playbook one, so an install that only ever chose
  // a playbook must still read back cleanly rather than as `{ model: undefined }`.
  it("defaults the model to '' when only a playbook was ever stored", async () => {
    mockGet.mockResolvedValue({ workflowsConfig: { playbook: 'toptal' } });
    expect(await getWorkflowsConfig()).toEqual({ playbook: 'toptal', model: '' });
  });

  it('reads from the "workflowsConfig" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getWorkflowsConfig();
    expect(mockGet).toHaveBeenCalledWith('workflowsConfig');
  });

  it('tolerates a non-object stored value', async () => {
    mockGet.mockResolvedValue({ workflowsConfig: 'toptal' });
    expect(await getWorkflowsConfig()).toEqual({ playbook: '', model: '' });
  });
});

describe('setWorkflowsConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({});
  });

  it('writes to the "workflowsConfig" storage key', async () => {
    await setWorkflowsConfig({ playbook: 'toptal', model: 'phi4' });
    expect(mockSet).toHaveBeenCalledWith({
      workflowsConfig: { playbook: 'toptal', model: 'phi4' },
    });
  });

  // The two assertions the whole two-owner design turns on. `stores/playbook.ts` writes
  // the playbook and `stores/settings.ts` writes the model; a replacing setter would let
  // either one silently erase the other's field.
  it('preserves a stored playbook when only the model is patched', async () => {
    mockGet.mockResolvedValue({ workflowsConfig: { playbook: 'toptal', model: '' } });
    await setWorkflowsConfig({ model: 'phi4' });
    expect(mockSet).toHaveBeenCalledWith({
      workflowsConfig: { playbook: 'toptal', model: 'phi4' },
    });
  });

  it('preserves a stored model when only the playbook is patched', async () => {
    mockGet.mockResolvedValue({ workflowsConfig: { playbook: '', model: 'phi4' } });
    await setWorkflowsConfig({ playbook: 'toptal' });
    expect(mockSet).toHaveBeenCalledWith({
      workflowsConfig: { playbook: 'toptal', model: 'phi4' },
    });
  });

  // `legacy-migration.ts` purges the bare `workflows` key by exact name on every startup.
  it('never touches any other key', async () => {
    await setWorkflowsConfig({ model: 'phi4' });
    expect(Object.keys(mockSet.mock.calls[0]?.[0] ?? {})).toEqual(['workflowsConfig']);
  });

  it("persists '' so the Workflows tab can go back to the active model", async () => {
    mockGet.mockResolvedValue({ workflowsConfig: { playbook: 'toptal', model: 'phi4' } });
    await setWorkflowsConfig({ model: '' });
    expect(mockSet).toHaveBeenCalledWith({
      workflowsConfig: { playbook: 'toptal', model: '' },
    });
  });
});

describe('availability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({});
  });

  it('returns a normalized default week when nothing is stored', async () => {
    mockGet.mockResolvedValue({});
    const week = await getAvailability();
    expect(Object.keys(week.days)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(Object.values(week.days)).toEqual(['', '', '', '', '']);
    expect(week.timeZone).toBe('');
    expect(week.updatedAt).toBe(0);
  });

  // Validation is `normalizeAvailability`'s job, not a pile of inline checks here.
  it('normalizes a shape an older build could have written', async () => {
    mockGet.mockResolvedValue({
      availability: {
        timeZone: 'Europe/Madrid',
        days: { mon: [{ enabled: true, start: '09:00', end: '13:00' }] },
      },
    });
    const week = await getAvailability();
    expect(week.timeZone).toBe('Europe/Madrid');
    // The earlier two-window shape is converted, not dropped — the hours are the user's.
    expect(week.days.mon).toBe('09:00-13:00');
    expect(week.days.tue).toBe('');
  });

  it('writes under its own key, leaving the profile prose and vectors alone', async () => {
    const week = await getAvailability();
    await setAvailability(week);
    expect(mockSet).toHaveBeenCalledWith({ availability: week });
  });
});

describe('getTavilyConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns '' on a fresh profile, which means web search is off", async () => {
    mockGet.mockResolvedValue({});
    expect(await getTavilyConfig()).toEqual({ apiKey: '' });
  });

  it('returns the stored key', async () => {
    mockGet.mockResolvedValue({ tavilyConfig: { apiKey: 'tvly-abc' } });
    expect(await getTavilyConfig()).toEqual({ apiKey: 'tvly-abc' });
  });

  it('reads from the "tavilyConfig" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getTavilyConfig();
    expect(mockGet).toHaveBeenCalledWith('tavilyConfig');
  });

  it('tolerates a non-object stored value', async () => {
    mockGet.mockResolvedValue({ tavilyConfig: 'tvly-abc' });
    expect(await getTavilyConfig()).toEqual({ apiKey: '' });
  });
});

describe('setTavilyConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes to the "tavilyConfig" storage key', async () => {
    const config: TavilyConfig = { apiKey: 'tvly-abc' };
    await setTavilyConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ tavilyConfig: config });
  });

  /**
   * The bare `search` key is the Brave-era name `legacy-migration.ts` removes on every install
   * *and* startup, so a credential stored there would vanish on the next browser restart with
   * nothing logged — the `workflows`/`workflowsConfig` hazard again.
   */
  it('never writes the retired "search" or "searchConfig" key', async () => {
    await setTavilyConfig({ apiKey: 'tvly-abc' });
    expect(Object.keys(mockSet.mock.calls[0]?.[0] ?? {})).toEqual(['tavilyConfig']);
  });

  it("persists '' so removing the key turns web search off", async () => {
    await setTavilyConfig({ apiKey: '' });
    expect(mockSet).toHaveBeenCalledWith({ tavilyConfig: { apiKey: '' } });
  });
});

describe('getLinkedInConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("defaults to '' — the packaged linkedin-voice.md is the source of truth", async () => {
    mockGet.mockResolvedValue({});
    expect(await getLinkedInConfig()).toEqual({ voiceSpec: '' });
    expect(mockGet).toHaveBeenCalledWith('linkedinConfig');
  });

  it('returns a stored override', async () => {
    mockGet.mockResolvedValue({ linkedinConfig: { voiceSpec: 'I write short.' } });
    expect(await getLinkedInConfig()).toEqual({ voiceSpec: 'I write short.' });
  });

  it('tolerates a non-object stored value', async () => {
    mockGet.mockResolvedValue({ linkedinConfig: 'nonsense' });
    expect(await getLinkedInConfig()).toEqual({ voiceSpec: '' });
  });
});

describe('setLinkedInConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes to the "linkedinConfig" storage key', async () => {
    await setLinkedInConfig({ voiceSpec: 'I write short.' });
    expect(mockSet).toHaveBeenCalledWith({ linkedinConfig: { voiceSpec: 'I write short.' } });
  });

  /**
   * The `Config` suffix is insurance, not decoration. `workflows` and `search` are both one
   * suffix from a name `legacy-migration.ts` deletes on every install and startup, and a
   * preference that vanishes on the next browser restart with nothing logged is the worst
   * failure this module can produce.
   */
  it('never writes a bare "linkedin" or "workflows" key', async () => {
    await setLinkedInConfig({ voiceSpec: 'x' });
    expect(Object.keys(mockSet.mock.calls[0]?.[0] ?? {})).toEqual(['linkedinConfig']);
  });

  /**
   * The voice spec is its own key rather than a third field on `workflowsConfig`: that key is
   * picker state read on every tab mount, this is a multi-kilobyte document. An edit to one
   * must never rewrite the other.
   */
  it('does not touch workflowsConfig', async () => {
    await setLinkedInConfig({ voiceSpec: 'x' });
    expect(mockSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ workflowsConfig: expect.anything() }),
    );
  });
});

describe('getLoveNoteConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("defaults to '' — the packaged love-note.md is the source of truth", async () => {
    mockGet.mockResolvedValue({});
    expect(await getLoveNoteConfig()).toEqual({ instructions: '' });
    expect(mockGet).toHaveBeenCalledWith('loveNoteConfig');
  });

  it('returns a stored override', async () => {
    mockGet.mockResolvedValue({ loveNoteConfig: { instructions: 'Le digo Chiqui.' } });
    expect(await getLoveNoteConfig()).toEqual({ instructions: 'Le digo Chiqui.' });
  });

  it('tolerates a non-object stored value', async () => {
    mockGet.mockResolvedValue({ loveNoteConfig: 'nonsense' });
    expect(await getLoveNoteConfig()).toEqual({ instructions: '' });
  });
});

describe('setLoveNoteConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes to the "loveNoteConfig" storage key and nothing else', async () => {
    await setLoveNoteConfig({ instructions: 'Le digo Chiqui.' });
    expect(mockSet).toHaveBeenCalledWith({ loveNoteConfig: { instructions: 'Le digo Chiqui.' } });
    expect(Object.keys(mockSet.mock.calls[0]?.[0] ?? {})).toEqual(['loveNoteConfig']);
  });

  /** A document, not picker state: an edit to it must never rewrite either sibling key. */
  it('touches neither workflowsConfig nor linkedinConfig', async () => {
    await setLoveNoteConfig({ instructions: 'x' });
    expect(mockSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ workflowsConfig: expect.anything() }),
    );
    expect(mockSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ linkedinConfig: expect.anything() }),
    );
  });
});
