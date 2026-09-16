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
} from '../storage';
import type { ChatConfig, NewsConfig } from '../storage';
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
