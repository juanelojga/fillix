import { describe, it, expect } from 'vitest';
import type { NewsCategory, NewsItem } from '../../../types';
import { dedupeKey, interleave, type NewsGroup } from '../interleave';

function item(id: string, category: NewsCategory, over: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    category,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    source: 'example.com',
    meta: '1 point',
    publishedAt: '2026-09-16T09:00:00Z',
    snippet: '',
    ...over,
  };
}

function group(category: NewsCategory, n: number, prefix = category): NewsGroup {
  return { category, items: Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, category)) };
}

const FOUR: NewsGroup[] = [
  group('ai', 5),
  group('technology', 5),
  group('software-development', 5),
  group('curiosities', 5),
];

describe('dedupeKey', () => {
  it('collapses www, trailing slash and query-string variants', () => {
    const a = item('a', 'ai', { url: 'https://www.example.com/Post/' });
    const b = item('b', 'ai', { url: 'https://example.com/post?utm_source=x' });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  // Every Ask HN fallback url shares the path /item, so the id has to stay in the key.
  it('keeps distinct HN item ids apart', () => {
    const a = item('a', 'ai', { url: 'https://news.ycombinator.com/item?id=1' });
    const b = item('b', 'ai', { url: 'https://news.ycombinator.com/item?id=2' });
    expect(dedupeKey(a)).not.toBe(dedupeKey(b));
  });

  it('falls back to the normalized title for an unparseable url', () => {
    expect(dedupeKey(item('a', 'ai', { url: 'not a url', title: 'Hello, World!' }))).toBe(
      'hello world',
    );
  });
});

describe('interleave', () => {
  it('round-robins the four categories in order', () => {
    expect(interleave(FOUR, 6).map((i) => i.category)).toEqual([
      'ai',
      'technology',
      'software-development',
      'curiosities',
      'ai',
      'technology',
    ]);
  });

  it('backfills from surviving groups when one is missing', () => {
    const three = FOUR.slice(0, 3);
    expect(interleave(three, 6)).toHaveLength(6);
  });

  it('fills entirely from one group when it is the only survivor', () => {
    const only = interleave([group('ai', 10)], 6);
    expect(only).toHaveLength(6);
    expect(only.every((i) => i.category === 'ai')).toBe(true);
  });

  it('returns what exists rather than padding when supply is short', () => {
    const items = interleave([group('ai', 2), group('technology', 2)], 6);
    expect(items).toHaveLength(4);
  });

  // The regression that matters: a dupe must cost a cursor step, not the group's slot.
  it('drops a cross-group duplicate and still returns six items', () => {
    const shared = item('shared', 'technology', { url: 'https://example.com/shared' });
    const groups: NewsGroup[] = [
      {
        category: 'ai',
        items: [{ ...shared, id: 'ai-dupe', category: 'ai' }, ...group('ai', 4).items],
      },
      { category: 'technology', items: [shared, ...group('technology', 4).items] },
      group('software-development', 4),
      group('curiosities', 4),
    ];

    const picked = interleave(groups, 6);
    expect(picked).toHaveLength(6);
    expect(picked.filter((i) => i.url === 'https://example.com/shared')).toHaveLength(1);
  });

  it('dedupes by id even when urls differ', () => {
    const groups: NewsGroup[] = [
      { category: 'ai', items: [item('same', 'ai', { url: 'https://a.com/1' })] },
      {
        category: 'technology',
        items: [item('same', 'technology', { url: 'https://b.com/2', title: 'Other' })],
      },
    ];
    expect(interleave(groups, 6)).toHaveLength(1);
  });

  it('returns an empty list for no groups', () => {
    expect(interleave([], 6)).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    expect(interleave(FOUR, 6).map((i) => i.id)).toEqual(interleave(FOUR, 6).map((i) => i.id));
  });
});
