import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFeaturedUrl, fetchWikipediaCuriosities } from '../wikipedia-featured';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

const NOW = new Date('2026-09-16T12:00:00Z');

function page(title: string, slug: string, extract = 'An extract.') {
  return {
    titles: { normalized: title },
    extract,
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${slug}` } },
  };
}

function ok(feed: unknown): Response {
  return new Response(JSON.stringify(feed), { status: 200 });
}

describe('buildFeaturedUrl', () => {
  it('zero-pads the UTC month and day', () => {
    expect(buildFeaturedUrl(new Date('2026-01-05T12:00:00Z'))).toBe(
      'https://en.wikipedia.org/api/rest_v1/feed/featured/2026/01/05',
    );
  });
});

describe('fetchWikipediaCuriosities', () => {
  it('maps tfa, mostread and onthisday into curiosities', async () => {
    mockFetch.mockResolvedValue(
      ok({
        tfa: page('Grace Coolidge', 'Grace_Coolidge'),
        mostread: { articles: [page('Matthew Rhys', 'Matthew_Rhys')] },
        onthisday: [{ year: 2013, text: 'Something happened.', pages: [page('Event', 'Event')] }],
      }),
    );

    const items = await fetchWikipediaCuriosities(new AbortController().signal, NOW);

    expect(items.map((i) => i.id)).toEqual(['wiki:tfa', 'wiki:mostread:0', 'wiki:onthisday:0']);
    expect(items.every((i) => i.category === 'curiosities')).toBe(true);
    expect(items.every((i) => i.source === 'Wikipedia')).toBe(true);
    expect(items[0]?.url).toBe('https://en.wikipedia.org/wiki/Grace_Coolidge');
    expect(items[2]?.meta).toBe('On this day · 2013');
    // The entry's own sentence beats the linked article's lede.
    expect(items[2]?.snippet).toBe('Something happened.');
  });

  it('does not throw when the payload is missing keys entirely', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await expect(fetchWikipediaCuriosities(new AbortController().signal, NOW)).resolves.toEqual([]);
  });

  // dyk entries carry only `html` and `text` — no pages, so no URL and no extract.
  it('ignores dyk', async () => {
    mockFetch.mockResolvedValue(ok({ dyk: [{ text: '... that something?', html: '<b>...</b>' }] }));
    const items = await fetchWikipediaCuriosities(new AbortController().signal, NOW);
    expect(items).toEqual([]);
  });

  it('skips entries with no url or no title', async () => {
    mockFetch.mockResolvedValue(
      ok({
        tfa: { titles: { normalized: 'No url' }, extract: 'x' },
        mostread: { articles: [{ content_urls: { desktop: { page: 'https://x' } } }] },
      }),
    );
    const items = await fetchWikipediaCuriosities(new AbortController().signal, NOW);
    expect(items).toEqual([]);
  });

  it('gives every item a unique id across sections', async () => {
    mockFetch.mockResolvedValue(
      ok({
        tfa: page('A', 'A'),
        mostread: { articles: [page('B', 'B'), page('C', 'C')] },
        onthisday: [{ year: 1999, text: 't', pages: [page('D', 'D')] }],
      }),
    );
    const ids = (await fetchWikipediaCuriosities(new AbortController().signal, NOW)).map(
      (i) => i.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects on a non-2xx response', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(fetchWikipediaCuriosities(new AbortController().signal, NOW)).rejects.toThrow(
      'Wikipedia returned 404',
    );
  });
});
