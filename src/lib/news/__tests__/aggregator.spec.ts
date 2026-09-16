import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../hacker-news', () => ({ fetchHackerNews: vi.fn() }));
vi.mock('../wikipedia-featured', () => ({ fetchWikipediaCuriosities: vi.fn() }));

import { refreshNews } from '../aggregator';
import { fetchHackerNews } from '../hacker-news';
import { fetchWikipediaCuriosities } from '../wikipedia-featured';
import type { NewsCategory, NewsItem } from '../../../types';

function items(prefix: string, category: NewsCategory, n = 5): NewsItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    category,
    title: `${prefix} ${i}`,
    url: `https://example.com/${prefix}${i}`,
    source: 'example.com',
    meta: '1 point',
    publishedAt: '2026-09-16T09:00:00Z',
    snippet: '',
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('refreshNews', () => {
  it('returns six items and no failures when every source answers', async () => {
    vi.mocked(fetchHackerNews).mockImplementation(async (category) => items(category, category));
    vi.mocked(fetchWikipediaCuriosities).mockResolvedValue(items('wiki', 'curiosities'));

    const { items: got, degraded } = await refreshNews();
    expect(got).toHaveLength(6);
    expect(degraded).toEqual([]);
  });

  it('degrades rather than failing when one source rejects', async () => {
    vi.mocked(fetchHackerNews).mockImplementation(async (category) => {
      if (category === 'technology') throw new Error('Hacker News returned 503');
      return items(category, category);
    });
    vi.mocked(fetchWikipediaCuriosities).mockResolvedValue(items('wiki', 'curiosities'));

    const { items: got, degraded } = await refreshNews();
    expect(got).toHaveLength(6);
    expect(degraded).toEqual([
      { category: 'technology', source: 'Hacker News', error: 'Hacker News returned 503' },
    ]);
  });

  it('treats an empty source as degraded', async () => {
    vi.mocked(fetchHackerNews).mockImplementation(async (category) =>
      category === 'ai' ? [] : items(category, category),
    );
    vi.mocked(fetchWikipediaCuriosities).mockResolvedValue(items('wiki', 'curiosities'));

    const { degraded } = await refreshNews();
    expect(degraded).toEqual([
      { category: 'ai', source: 'Hacker News', error: 'returned no items' },
    ]);
  });

  it('throws only when every source fails, naming them', async () => {
    vi.mocked(fetchHackerNews).mockRejectedValue(new Error('down'));
    vi.mocked(fetchWikipediaCuriosities).mockRejectedValue(new Error('down'));

    await expect(refreshNews()).rejects.toThrow(
      'No news sources responded (Hacker News, Wikipedia)',
    );
  });

  // Sequential fan-out would make a slow source delay the rest; assert they all start.
  it('starts all four sources before awaiting any of them', async () => {
    vi.mocked(fetchHackerNews).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchWikipediaCuriosities).mockReturnValue(new Promise(() => {}));

    void refreshNews();
    await Promise.resolve();

    expect(fetchHackerNews).toHaveBeenCalledTimes(3);
    expect(fetchWikipediaCuriosities).toHaveBeenCalledTimes(1);
  });

  it('hands every source an abort signal', async () => {
    vi.mocked(fetchHackerNews).mockResolvedValue(items('hn', 'ai'));
    vi.mocked(fetchWikipediaCuriosities).mockResolvedValue(items('wiki', 'curiosities'));

    await refreshNews();
    expect(vi.mocked(fetchHackerNews).mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(vi.mocked(fetchWikipediaCuriosities).mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });
});
