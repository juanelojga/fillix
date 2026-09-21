import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSearchBody,
  checkTavilyKey,
  extractTavilyError,
  searchWeb,
} from '../../tavily/search';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const KEY = 'tvly-test-key';
const signal = new AbortController().signal;

const hit = (over: Record<string, unknown> = {}) => ({
  title: 'Svelte 5 is alive',
  url: 'https://svelte.dev/blog/svelte-5-is-alive',
  content: 'Runes are a new reactivity system.',
  ...over,
});

const reply = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('buildSearchBody', () => {
  it('fixes the parameters the model is not allowed to set', () => {
    const body = buildSearchBody({ query: 'svelte 5' });
    expect(body).toMatchObject({
      query: 'svelte 5',
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_published_date: true,
      chunks_per_source: 1,
    });
  });

  it('omits optional keys entirely rather than sending them undefined', () => {
    const body = buildSearchBody({ query: 'q' });
    expect(body).not.toHaveProperty('topic');
    expect(body).not.toHaveProperty('time_range');
    expect(body).not.toHaveProperty('include_domains');
  });

  it('forwards the narrowing the model did ask for', () => {
    expect(buildSearchBody({ query: 'q', topic: 'news', timeRange: 'week' })).toMatchObject({
      topic: 'news',
      time_range: 'week',
    });
  });

  it('forwards domains as include_domains', () => {
    expect(buildSearchBody({ query: 'q', domains: ['arxiv.org'] })).toMatchObject({
      include_domains: ['arxiv.org'],
    });
  });
});

describe('extractTavilyError', () => {
  it('reads the nested detail.error shape an auth failure uses', () => {
    expect(
      extractTavilyError('{"detail":{"error":"Unauthorized: missing or invalid API key."}}'),
    ).toBe('Unauthorized: missing or invalid API key.');
  });

  it('reads a bare string detail', () => {
    expect(extractTavilyError('{"detail":"query too long"}')).toBe('query too long');
  });

  it('reads a top-level error', () => {
    expect(extractTavilyError('{"error":"Search failed"}')).toBe('Search failed');
  });

  it('returns the raw body when it is not the shape we know', () => {
    expect(extractTavilyError('<html>502</html>')).toBe('<html>502</html>');
  });

  it('returns empty for an empty body', () => {
    expect(extractTavilyError('')).toBe('');
  });
});

describe('searchWeb', () => {
  it('POSTs to /search with a Bearer header and the built body', async () => {
    mockFetch.mockResolvedValue(reply({ results: [hit()] }));
    await searchWeb(KEY, { query: 'svelte 5' }, signal);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'svelte 5', max_results: 5 });
  });

  it('maps hits to the shape the formatter reads', async () => {
    mockFetch.mockResolvedValue(reply({ results: [hit({ published_date: '2026-09-14' })] }));
    await expect(searchWeb(KEY, { query: 'q' }, signal)).resolves.toEqual([
      {
        title: 'Svelte 5 is alive',
        url: 'https://svelte.dev/blog/svelte-5-is-alive',
        content: 'Runes are a new reactivity system.',
        publishedDate: '2026-09-14',
      },
    ]);
  });

  it('defaults a missing published_date to empty rather than undefined', async () => {
    mockFetch.mockResolvedValue(reply({ results: [hit()] }));
    const [result] = await searchWeb(KEY, { query: 'q' }, signal);
    expect(result.publishedDate).toBe('');
  });

  // Validated rather than trusted, as getProfileIndex and fetchHackerNews are: a malformed reply
  // must read as "no results", not crash the whole turn.
  it('returns an empty list when results is missing', async () => {
    mockFetch.mockResolvedValue(reply({ query: 'q' }));
    await expect(searchWeb(KEY, { query: 'q' }, signal)).resolves.toEqual([]);
  });

  it('drops a hit with no url, which nothing downstream could link to', async () => {
    mockFetch.mockResolvedValue(reply({ results: [hit({ url: null }), hit()] }));
    await expect(searchWeb(KEY, { query: 'q' }, signal)).resolves.toHaveLength(1);
  });

  for (const status of [400, 401, 422, 429, 432, 433, 500]) {
    it(`throws a diagnosable message on ${status}`, async () => {
      mockFetch.mockResolvedValue(reply({ detail: { error: 'nope' } }, status));
      await expect(searchWeb(KEY, { query: 'q' }, signal)).rejects.toThrow(
        `Tavily /search returned ${status}: nope`,
      );
    });
  }

  // Read in the client because search-diagnostics.ts is a pure function of a string and cannot
  // reach the Response headers.
  it('folds Retry-After into the message', async () => {
    mockFetch.mockResolvedValue(reply({ detail: 'slow down' }, 429, { 'Retry-After': '12' }));
    await expect(searchWeb(KEY, { query: 'q' }, signal)).rejects.toThrow(
      'Tavily /search returned 429: slow down (retry after 12s)',
    );
  });

  it('lets a network failure through for the diagnostics to classify', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(searchWeb(KEY, { query: 'q' }, signal)).rejects.toThrow('Failed to fetch');
  });
});

describe('checkTavilyKey', () => {
  it('GETs /usage with a Bearer header and spends no search credit', async () => {
    mockFetch.mockResolvedValue(reply({ key: { usage: 150, limit: 1000 } }));
    const status = await checkTavilyKey(KEY, signal);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/usage');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(status).toMatchObject({ used: 150, limit: 1000 });
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // null rather than 0: a figure we do not have must not render as an exhausted allowance.
  it('reports unknown figures as null', async () => {
    mockFetch.mockResolvedValue(reply({ account: {} }));
    const status = await checkTavilyKey(KEY, signal);
    expect(status.used).toBeNull();
    expect(status.limit).toBeNull();
  });

  it('names the /usage endpoint in its error so the diagnosis can say where it broke', async () => {
    mockFetch.mockResolvedValue(reply({ detail: { error: 'Unauthorized' } }, 401));
    await expect(checkTavilyKey(KEY, signal)).rejects.toThrow(
      'Tavily /usage returned 401: Unauthorized',
    );
  });
});
