import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProviderConfigs, setProviderConfigs } from '../storage';
import type { ProviderConfigs } from '../storage';

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

describe('getProviderConfigs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns {} when providerConfigs key is absent (new install)', async () => {
    mockGet.mockResolvedValue({});
    const configs = await getProviderConfigs();
    expect(configs).toEqual({});
  });

  it('returns the stored map when providerConfigs key is present', async () => {
    const stored: ProviderConfigs = {
      openai: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: 'sk-test',
      },
    };
    mockGet.mockResolvedValue({ providerConfigs: stored });
    const configs = await getProviderConfigs();
    expect(configs).toEqual(stored);
  });

  it('reads from the "providerConfigs" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getProviderConfigs();
    expect(mockGet).toHaveBeenCalledWith('providerConfigs');
  });

  it('returns a map with multiple providers when all are stored', async () => {
    const stored: ProviderConfigs = {
      ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' },
      openai: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: 'sk-abc',
      },
    };
    mockGet.mockResolvedValue({ providerConfigs: stored });
    const configs = await getProviderConfigs();
    expect(Object.keys(configs)).toHaveLength(2);
    expect(configs['ollama']?.model).toBe('llama3.2');
    expect(configs['openai']?.apiKey).toBe('sk-abc');
  });
});

describe('setProviderConfigs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the "providerConfigs" storage key', async () => {
    const map: ProviderConfigs = {
      ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' },
    };
    await setProviderConfigs(map);
    expect(mockSet).toHaveBeenCalledWith({ providerConfigs: map });
  });

  it('persists the exact map object passed', async () => {
    const map: ProviderConfigs = {
      openai: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: 'sk-abc',
      },
    };
    await setProviderConfigs(map);
    expect(mockSet).toHaveBeenCalledWith({ providerConfigs: map });
  });

  it('round-trips: setProviderConfigs then getProviderConfigs returns the same map', async () => {
    const map: ProviderConfigs = {
      openai: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: 'sk-abc',
      },
      ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'phi4' },
    };
    mockSet.mockResolvedValue(undefined);
    // Simulate persistence: after set, get returns the same data
    mockGet.mockResolvedValue({ providerConfigs: map });
    await setProviderConfigs(map);
    const retrieved = await getProviderConfigs();
    expect(retrieved).toEqual(map);
  });

  it('accepts an empty map without error', async () => {
    await expect(setProviderConfigs({})).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith({ providerConfigs: {} });
  });
});
