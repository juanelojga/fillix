import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHnUrl, fetchHackerNews } from '../hacker-news';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

const NOW = new Date('2026-09-16T12:00:00Z');

function hit(over: Record<string, unknown> = {}) {
  return {
    objectID: '41234567',
    title: 'A story',
    url: 'https://www.techcrunch.com/a-story',
    points: 120,
    num_comments: 34,
    created_at: '2026-09-16T09:00:00Z',
    ...over,
  };
}

function ok(hits: unknown[]): Response {
  return new Response(JSON.stringify({ hits }), { status: 200 });
}

describe('buildHnUrl', () => {
  it('encodes tags, query and both numeric filters', () => {
    const url = buildHnUrl(
      { tags: 'story', query: 'AI', windowSeconds: 172_800, minPoints: 30 },
      NOW,
    );
    expect(url).toContain('tags=story');
    expect(url).toContain('query=AI');
    const since = Math.floor(NOW.getTime() / 1000) - 172_800;
    expect(decodeURIComponent(url)).toContain(`numericFilters=created_at_i>${since},points>30`);
  });

  it('omits numericFilters entirely for a tag-only feed', () => {
    const url = buildHnUrl({ tags: 'front_page' }, NOW);
    expect(url).toContain('tags=front_page');
    expect(url).not.toContain('numericFilters');
    expect(url).not.toContain('query=');
  });
});

describe('fetchHackerNews', () => {
  it('maps a hit to a NewsItem with a source-prefixed id', async () => {
    mockFetch.mockResolvedValue(ok([hit()]));
    const [item] = await fetchHackerNews(
      'ai',
      { tags: 'story' },
      new AbortController().signal,
      NOW,
    );

    expect(item?.id).toBe('hn:41234567');
    expect(item?.category).toBe('ai');
    expect(item?.source).toBe('techcrunch.com');
    expect(item?.meta).toBe('120 points · 34 comments · 3h ago');
  });

  it('falls back to the HN thread when a self-post has no url', async () => {
    mockFetch.mockResolvedValue(ok([hit({ url: null })]));
    const [item] = await fetchHackerNews(
      'ai',
      { tags: 'story' },
      new AbortController().signal,
      NOW,
    );

    expect(item?.url).toBe('https://news.ycombinator.com/item?id=41234567');
    expect(item?.source).toBe('news.ycombinator.com');
  });

  it('treats missing points and comments as zero, never NaN', async () => {
    mockFetch.mockResolvedValue(ok([hit({ points: null, num_comments: null })]));
    const [item] = await fetchHackerNews(
      'ai',
      { tags: 'story' },
      new AbortController().signal,
      NOW,
    );

    expect(item?.meta).toContain('0 points');
    expect(item?.meta).toContain('0 comments');
    expect(item?.meta).not.toContain('NaN');
  });

  it('strips markup out of a self-post snippet', async () => {
    mockFetch.mockResolvedValue(ok([hit({ story_text: '<p>Hello  <b>there</b></p>' })]));
    const [item] = await fetchHackerNews(
      'ai',
      { tags: 'story' },
      new AbortController().signal,
      NOW,
    );

    expect(item?.snippet).toBe('Hello there');
  });

  it('skips hits with no objectID or title', async () => {
    mockFetch.mockResolvedValue(ok([hit(), { objectID: 'x' }, { title: 'no id' }]));
    const items = await fetchHackerNews('ai', { tags: 'story' }, new AbortController().signal, NOW);

    expect(items).toHaveLength(1);
  });

  // Adapters throw rather than returning "Error: ..." strings, because allSettled needs
  // a rejection to classify the source as degraded.
  it('rejects on a non-2xx response', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(
      fetchHackerNews('ai', { tags: 'story' }, new AbortController().signal, NOW),
    ).rejects.toThrow('Hacker News returned 503');
  });

  it('rejects when the network fails', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    await expect(
      fetchHackerNews('ai', { tags: 'story' }, new AbortController().signal, NOW),
    ).rejects.toThrow('Failed to fetch');
  });

  it('passes the caller signal through to fetch', async () => {
    mockFetch.mockResolvedValue(ok([]));
    const signal = new AbortController().signal;
    await fetchHackerNews('ai', { tags: 'story' }, signal, NOW);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(signal);
    expect(init.credentials).toBe('omit');
  });
});
