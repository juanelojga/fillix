import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateLegacyProviderKeys } from '../legacy-migration';

let store: Record<string, unknown> = {};
const mockGet = vi.fn(async (keys: string[]) =>
  Object.fromEntries(keys.filter((k) => store[k] !== undefined).map((k) => [k, store[k]])),
);
const mockSet = vi.fn(async (items: Record<string, unknown>) => {
  Object.assign(store, items);
});
const mockRemove = vi.fn(async (keys: string[]) => {
  for (const k of keys) delete store[k];
});

vi.stubGlobal('chrome', {
  storage: { local: { get: mockGet, set: mockSet, remove: mockRemove } },
});

beforeEach(() => {
  store = {};
  mockSet.mockClear();
  mockRemove.mockClear();
});

describe('migrateLegacyProviderKeys', () => {
  it('is a no-op on a profile that never had the legacy keys', async () => {
    await migrateLegacyProviderKeys();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('seeds the ollama key from a legacy Ollama provider config', async () => {
    store.provider = { provider: 'ollama', baseUrl: 'http://custom:11434', model: 'mistral' };
    await migrateLegacyProviderKeys();
    expect(store.ollama).toEqual({ baseUrl: 'http://custom:11434', model: 'mistral' });
  });

  it('drops a legacy OpenAI config without carrying its key forward', async () => {
    store.provider = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      apiKey: 'sk-secret',
    };
    await migrateLegacyProviderKeys();
    expect(store.ollama).toBeUndefined();
    expect(JSON.stringify(store)).not.toContain('sk-secret');
  });

  it('does not clobber an existing ollama key', async () => {
    store.ollama = { baseUrl: 'http://localhost:11434', model: 'phi3' };
    store.provider = { provider: 'ollama', baseUrl: 'http://other:11434', model: 'mistral' };
    await migrateLegacyProviderKeys();
    expect(store.ollama).toEqual({ baseUrl: 'http://localhost:11434', model: 'phi3' });
  });

  it('seeds the model list from the Ollama favorites', async () => {
    store.provider = { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' };
    store.favoriteModels = { ollama: ['phi4', 'mistral'], openai: ['gpt-4o'] };
    await migrateLegacyProviderKeys();
    expect(store.models).toEqual(['phi4', 'mistral', 'llama3.2']);
  });

  it('does not duplicate the active model when it is already a favorite', async () => {
    store.provider = { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'phi4' };
    store.favoriteModels = { ollama: ['phi4'] };
    await migrateLegacyProviderKeys();
    expect(store.models).toEqual(['phi4']);
  });

  it('ignores favorites belonging to remote providers', async () => {
    store.provider = { provider: 'openai', baseUrl: 'https://api.openai.com', model: 'gpt-4o' };
    store.favoriteModels = { openai: ['gpt-4o'] };
    await migrateLegacyProviderKeys();
    expect(store.models).toBeUndefined();
  });

  it('removes every legacy key', async () => {
    store.provider = { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' };
    store.providerConfigs = { openai: { apiKey: 'sk-secret' } };
    store.favoriteModels = { ollama: ['phi4'] };
    await migrateLegacyProviderKeys();
    expect(store.provider).toBeUndefined();
    expect(store.providerConfigs).toBeUndefined();
    expect(store.favoriteModels).toBeUndefined();
  });

  it('is idempotent — a second run does nothing', async () => {
    store.provider = { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' };
    await migrateLegacyProviderKeys();
    mockSet.mockClear();
    mockRemove.mockClear();

    await migrateLegacyProviderKeys();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
