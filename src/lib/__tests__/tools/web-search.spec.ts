// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webSearch } from '../../tools/web-search';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

const braveResults = {
  web: {
    results: [
      { title: 'Result 1', url: 'https://example.com/1', description: 'Snippet 1' },
      { title: 'Result 2', url: 'https://example.com/2', description: 'Snippet 2' },
      { title: 'Result 3', url: 'https://example.com/3', description: 'Snippet 3' },
    ],
  },
};

describe('webSearch', () => {
  it('returns Error: string immediately when braveApiKey is empty — never fetches', async () => {
    const result = await webSearch('AI news', '');

    expect(result).toMatch(/^Error:.*[Bb]rave/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('GETs the Brave Search API with query and count=5', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(braveResults), { status: 200 }));

    await webSearch('AI news', 'bsak-test');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('count=5');
    expect(url).toContain(encodeURIComponent('AI news'));
  });

  it('sends X-Subscription-Token header with the Brave API key', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(braveResults), { status: 200 }));

    await webSearch('AI news', 'bsak-test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Subscription-Token']).toBe('bsak-test');
    expect(headers['Accept']).toBe('application/json');
  });

  it('returns results as a numbered list with title, URL, and snippet', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(braveResults), { status: 200 }));

    const result = await webSearch('AI news', 'bsak-test');

    expect(result).toContain('1.');
    expect(result).toContain('Result 1');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('Snippet 1');
  });

  it('returns Error: string on non-2xx response — never throws', async () => {
    mockFetch.mockResolvedValue(new Response('Too Many Requests', { status: 429 }));

    const result = await webSearch('AI news', 'bsak-test');

    expect(result).toMatch(/^Error:/);
  });

  it('returns Error: string on network failure — never throws', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await webSearch('AI news', 'bsak-test');

    expect(result).toMatch(/^Error:/);
  });
});
