// TODO: pnpm add -D vitest
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getObsidianConfig, setObsidianConfig } from './storage';
import type { ObsidianConfig } from '../types';

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

describe('getObsidianConfig', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
  });

  it('returns defaults when nothing is stored', async () => {
    mockGet.mockResolvedValue({ obsidian: undefined });

    const config = await getObsidianConfig();

    expect(config).toEqual({
      host: 'localhost',
      port: 27123,
      apiKey: '',
    });
  });

  it('merges stored values over defaults', async () => {
    const stored: Partial<ObsidianConfig> = { apiKey: 'secret', port: 9999 };
    mockGet.mockResolvedValue({ obsidian: stored });

    const config = await getObsidianConfig();

    expect(config).toEqual({
      host: 'localhost',
      port: 9999,
      apiKey: 'secret',
    });
  });

  it('preserves optional paths when stored', async () => {
    const stored: Partial<ObsidianConfig> = {
      apiKey: 'key',
      profilePath: 'Profile/Me.md',
      systemPromptPath: 'Prompts/System.md',
    };
    mockGet.mockResolvedValue({ obsidian: stored });

    const config = await getObsidianConfig();

    expect(config.profilePath).toBe('Profile/Me.md');
    expect(config.systemPromptPath).toBe('Prompts/System.md');
  });

  it('does not strip or transform the API key', async () => {
    const rawKey = '  abc==xyz  ';
    mockGet.mockResolvedValue({ obsidian: { apiKey: rawKey } });

    const config = await getObsidianConfig();

    expect(config.apiKey).toBe(rawKey);
  });

  it('reads from the "obsidian" storage key', async () => {
    mockGet.mockResolvedValue({ obsidian: undefined });

    await getObsidianConfig();

    expect(mockGet).toHaveBeenCalledWith('obsidian');
  });
});

describe('setObsidianConfig', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the "obsidian" storage key', async () => {
    const config: ObsidianConfig = { host: 'localhost', port: 27123, apiKey: 'key' };

    await setObsidianConfig(config);

    expect(mockSet).toHaveBeenCalledWith({ obsidian: config });
  });

  it('persists optional paths without modification', async () => {
    const config: ObsidianConfig = {
      host: 'localhost',
      port: 27123,
      apiKey: 'key',
      profilePath: 'Notes/Profile.md',
      systemPromptPath: 'Notes/Sys.md',
    };

    await setObsidianConfig(config);

    expect(mockSet).toHaveBeenCalledWith({ obsidian: config });
  });
});
