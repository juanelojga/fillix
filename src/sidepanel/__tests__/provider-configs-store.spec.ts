import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { ProviderConfig } from '../../types';
import type { ProviderConfigs } from '../../lib/storage';

// Mock all storage functions so tests control return values without hitting chrome APIs
vi.mock('../../lib/storage', () => ({
  getProviderConfig: vi.fn(),
  getSearchConfig: vi.fn(),
  getFavoriteModels: vi.fn(),
  getProviderConfigs: vi.fn(),
  setProviderConfig: vi.fn().mockResolvedValue(undefined),
  setSearchConfig: vi.fn().mockResolvedValue(undefined),
  setFavoriteModels: vi.fn().mockResolvedValue(undefined),
  setProviderConfigs: vi.fn().mockResolvedValue(undefined),
}));

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false }) },
});

import {
  getProviderConfig,
  getSearchConfig,
  getFavoriteModels,
  getProviderConfigs,
  setProviderConfigs,
} from '../../lib/storage';

import { loadSettings, saveSettings, providerConfigs } from '../stores/settings';

const ollamaDefault: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

const openAIConfig: ProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  apiKey: 'sk-test',
};

describe('loadSettings — providerConfigs seeding (Task 1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProviderConfig).mockResolvedValue(ollamaDefault);
    vi.mocked(getSearchConfig).mockResolvedValue({});
    vi.mocked(getFavoriteModels).mockResolvedValue({});
  });

  it('seeds providerConfigs from the active provider when storage returns an empty map', async () => {
    vi.mocked(getProviderConfigs).mockResolvedValue({});
    await loadSettings();
    const map = get(providerConfigs);
    expect(map['ollama']).toEqual(ollamaDefault);
  });

  it('uses the stored providerConfigs when the key is present and non-empty', async () => {
    const stored: ProviderConfigs = { openai: openAIConfig };
    vi.mocked(getProviderConfigs).mockResolvedValue(stored);
    await loadSettings();
    const map = get(providerConfigs);
    expect(map['openai']).toEqual(openAIConfig);
    expect(map['ollama']).toBeUndefined();
  });

  it('sets the providerConfigs store to the seeded map (not undefined)', async () => {
    vi.mocked(getProviderConfigs).mockResolvedValue({});
    await loadSettings();
    const map = get(providerConfigs);
    expect(map).toBeDefined();
    expect(typeof map).toBe('object');
  });
});

describe('saveSettings — providerConfigs persistence (Task 1.3)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getProviderConfig).mockResolvedValue(ollamaDefault);
    vi.mocked(getSearchConfig).mockResolvedValue({});
    vi.mocked(getFavoriteModels).mockResolvedValue({});
    // Pre-seed the store with an existing openai entry
    vi.mocked(getProviderConfigs).mockResolvedValue({ openai: openAIConfig });
    vi.mocked(setProviderConfigs).mockResolvedValue(undefined);
    await loadSettings();
  });

  it('merges the new provider config into the existing providerConfigs map', async () => {
    await saveSettings(ollamaDefault, {});
    const map = get(providerConfigs);
    expect(map['ollama']).toEqual(ollamaDefault);
    expect(map['openai']).toEqual(openAIConfig);
  });

  it('calls setProviderConfigs with the merged map', async () => {
    await saveSettings(ollamaDefault, {});
    expect(setProviderConfigs).toHaveBeenCalledWith(
      expect.objectContaining({ ollama: ollamaDefault, openai: openAIConfig }),
    );
  });

  it('updates the providerConfigs store in-memory after save', async () => {
    await saveSettings(ollamaDefault, {});
    const map = get(providerConfigs);
    expect(map['ollama']).toEqual(ollamaDefault);
  });

  it('does not call setProviderConfigs with undefined as the map value', async () => {
    await saveSettings(ollamaDefault, {});
    const [calledWith] = vi.mocked(setProviderConfigs).mock.calls[0];
    expect(calledWith).toBeDefined();
    for (const value of Object.values(calledWith)) {
      expect(value).toBeDefined();
    }
  });
});
