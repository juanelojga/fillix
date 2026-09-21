import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({ getTavilyConfig: vi.fn() }));
vi.mock('../../tavily/search', () => ({ searchWeb: vi.fn() }));

import { getTavilyConfig } from '../../storage';
import { searchWeb } from '../../tavily/search';
import { tavilySearch } from '../../tools/tavily-search';

const KEY = 'tvly-secret-key';

const hit = (over = {}) => ({
  title: 'Svelte 5 is alive',
  url: 'https://svelte.dev/blog/svelte-5-is-alive',
  content: 'Runes.',
  publishedDate: '',
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTavilyConfig).mockResolvedValue({ apiKey: KEY });
});

describe('tavilySearch', () => {
  it('returns the formatted blocks on the happy path', async () => {
    vi.mocked(searchWeb).mockResolvedValue([hit()]);
    const result = await tavilySearch({ query: 'svelte 5' });
    expect(result).toContain('1. Svelte 5 is alive');
    expect(result.startsWith('Error:')).toBe(false);
  });

  it('hands the parsed params and a timeout signal to the client', async () => {
    vi.mocked(searchWeb).mockResolvedValue([hit()]);
    await tavilySearch({ query: 'ollama', topic: 'news', time_range: 'week' });
    const [key, params, signal] = vi.mocked(searchWeb).mock.calls[0];
    expect(key).toBe(KEY);
    expect(params).toEqual({ query: 'ollama', topic: 'news', timeRange: 'week' });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  // Reachable even though tool-prompt.ts withholds the tool without a key: the user can clear
  // the key mid-conversation, and a model that saw it advertised earlier still calls it.
  it('refuses without a key and names the tab that fixes it', async () => {
    vi.mocked(getTavilyConfig).mockResolvedValue({ apiKey: '' });
    const result = await tavilySearch({ query: 'q' });
    expect(result).toMatch(/^Error: No API key saved/);
    expect(result).toContain('Settings tab');
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it('refuses a missing query before spending a request', async () => {
    const result = await tavilySearch({});
    expect(result).toBe('Error: tavily_search needs a "query" argument.');
    expect(searchWeb).not.toHaveBeenCalled();
  });

  // The three-outcome rule profile-search.ts states: "the web has nothing" and "search is broken"
  // are very different things to tell someone.
  it('words an empty result as prose, not as an Error', async () => {
    vi.mocked(searchWeb).mockResolvedValue([]);
    const result = await tavilySearch({ query: 'q' });
    expect(result.startsWith('Error:')).toBe(false);
    expect(result).toContain('No web results');
  });

  it('turns a failure into wording we authored', async () => {
    vi.mocked(searchWeb).mockRejectedValue(
      new Error('Tavily /search returned 401: Unauthorized: missing or invalid API key.'),
    );
    const result = await tavilySearch({ query: 'q' });
    expect(result).toMatch(/^Error: Tavily rejected the key\./);
  });

  /**
   * The load-bearing one. A tool result is appended to the conversation as a user message, so
   * anything Tavily says would become part of the chat history the model can quote back.
   */
  it("lets neither the key nor Tavily's own message reach the conversation", async () => {
    vi.mocked(searchWeb).mockRejectedValue(
      new Error(`Tavily /search returned 401: bad token ${KEY}`),
    );
    const result = await tavilySearch({ query: 'q' });
    expect(result).not.toContain(KEY);
    expect(result).not.toContain('bad token');
  });

  it('never throws when storage rejects', async () => {
    vi.mocked(getTavilyConfig).mockRejectedValue(new Error('storage unavailable'));
    await expect(tavilySearch({ query: 'q' })).resolves.toMatch(/^Error:/);
  });

  it('never throws for a non-Error rejection', async () => {
    vi.mocked(searchWeb).mockRejectedValue('nope');
    await expect(tavilySearch({ query: 'q' })).resolves.toMatch(/^Error:/);
  });
});
