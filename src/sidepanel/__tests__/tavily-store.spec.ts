import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const store: Record<string, unknown> = {};
const mockSendMessage = vi.fn();
const setSpy = vi.fn();

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
        setSpy(items);
        Object.assign(store, items);
      }),
    },
  },
  runtime: { sendMessage: mockSendMessage },
});

import {
  tavilyApiKey,
  hydrateTavilyKey,
  saveTavilyKey,
  clearTavilyKey,
  testTavilyKey,
} from '../stores/tavily';

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  mockSendMessage.mockReset();
  setSpy.mockReset();
  tavilyApiKey.set('');
});

describe('hydrateTavilyKey', () => {
  it('defaults to empty on a fresh profile, which means web search is off', async () => {
    await hydrateTavilyKey();
    expect(get(tavilyApiKey)).toBe('');
  });

  it('reads the stored key', async () => {
    store.tavilyConfig = { apiKey: 'tvly-abc' };
    await hydrateTavilyKey();
    expect(get(tavilyApiKey)).toBe('tvly-abc');
  });
});

describe('saveTavilyKey', () => {
  it('writes the tavilyConfig key and nothing else', async () => {
    await saveTavilyKey('tvly-abc');
    expect(setSpy).toHaveBeenCalledWith({ tavilyConfig: { apiKey: 'tvly-abc' } });
    expect(Object.keys(setSpy.mock.calls[0][0])).toEqual(['tavilyConfig']);
  });

  /**
   * `search` is purged by legacy-migration.ts on every install *and* startup, and `searchConfig`
   * is pinned dead so the retired Brave tool cannot return under its old storage name. A write to
   * either would vanish on the next browser restart with nothing logged.
   */
  it('never touches the retired search key names', async () => {
    await saveTavilyKey('tvly-abc');
    expect(Object.keys(store)).not.toContain('search');
    expect(Object.keys(store)).not.toContain('searchConfig');
  });

  it('trims what was pasted', async () => {
    await saveTavilyKey('  tvly-abc\n');
    expect(get(tavilyApiKey)).toBe('tvly-abc');
    expect(store.tavilyConfig).toEqual({ apiKey: 'tvly-abc' });
  });

  it('writes storage before the store, so a failed write cannot leave the UI lying', async () => {
    let storeValueAtWrite = 'unset';
    setSpy.mockImplementation(() => {
      storeValueAtWrite = get(tavilyApiKey);
    });
    await saveTavilyKey('tvly-abc');
    expect(storeValueAtWrite).toBe('');
  });
});

describe('clearTavilyKey', () => {
  it('stores empty, which turns the tool off and unadvertises it', async () => {
    await saveTavilyKey('tvly-abc');
    await clearTavilyKey();
    expect(get(tavilyApiKey)).toBe('');
    expect(store.tavilyConfig).toEqual({ apiKey: '' });
  });
});

describe('testTavilyKey', () => {
  it('sends TEST_TAVILY with no payload — the worker reads the key from storage', async () => {
    mockSendMessage.mockResolvedValue({
      ok: true,
      tavily: { latencyMs: 90, used: 1, limit: 1000 },
    });
    await testTavilyKey();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'TEST_TAVILY' });
  });

  it('returns the key status on success', async () => {
    mockSendMessage.mockResolvedValue({
      ok: true,
      tavily: { latencyMs: 312, used: 150, limit: 1000 },
    });
    await expect(testTavilyKey()).resolves.toEqual({
      ok: true,
      status: { latencyMs: 312, used: 150, limit: 1000 },
    });
  });

  it('passes a worded failure straight through for the panel to diagnose', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'Tavily /usage returned 401: nope' });
    await expect(testTavilyKey()).resolves.toEqual({
      ok: false,
      error: 'Tavily /usage returned 401: nope',
    });
  });

  it('words a dead service worker rather than hanging', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const result = await testTavilyKey();
    expect(result).toEqual({ ok: false, error: 'No response from the extension service worker' });
  });

  it('catches a thrown sendMessage', async () => {
    mockSendMessage.mockRejectedValue(new Error('port closed'));
    await expect(testTavilyKey()).resolves.toEqual({ ok: false, error: 'port closed' });
  });
});
