// Runs in node, deliberately: the tool now parses JSON, so it needs no DOM. The old
// Google News RSS implementation used DOMParser, which does not exist in an MV3
// service worker — this spec used to pin jsdom and pass against behaviour the runtime
// could never produce.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsFeed } from '../../tools/news-feed';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

function hits(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    objectID: String(i),
    title: `Story ${i}`,
    url: `https://example.com/${i}`,
    points: 10 + i,
    num_comments: i,
    created_at: '2026-09-16T09:00:00Z',
  }));
}

function ok(n: number): Response {
  return new Response(JSON.stringify({ hits: hits(n) }), { status: 200 });
}

describe('newsFeed', () => {
  it('queries Hacker News, not Google News', async () => {
    mockFetch.mockResolvedValue(ok(1));
    await newsFeed('ollama');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('hn.algolia.com');
    expect(url).toContain('query=ollama');
  });

  it('formats numbered lines the chat loop can parse', async () => {
    mockFetch.mockResolvedValue(ok(2));
    const out = await newsFeed('ollama');

    expect(out.split('\n')).toHaveLength(2);
    expect(out).toContain('1. Story 0 — ');
    expect(out).toContain('(https://example.com/0)');
  });

  it('caps at five items', async () => {
    mockFetch.mockResolvedValue(ok(12));
    expect((await newsFeed('ollama')).split('\n')).toHaveLength(5);
  });

  it('reports an empty feed as an error string', async () => {
    mockFetch.mockResolvedValue(ok(0));
    expect(await newsFeed('ollama')).toBe('Error: no news items found');
  });

  // Tools signal failure with a string; they never throw at the ReAct loop.
  it('returns an Error string on a non-2xx response', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 503 }));
    expect(await newsFeed('ollama')).toBe('Error: Hacker News returned 503');
  });

  it('returns an Error string when the network fails', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    expect(await newsFeed('ollama')).toBe('Error: Failed to fetch');
  });
});
