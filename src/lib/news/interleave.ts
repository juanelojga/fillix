import type { NewsCategory, NewsItem } from '../../types';

export interface NewsGroup {
  category: NewsCategory;
  items: NewsItem[];
}

/**
 * Host + path, lowercased, `www.` and trailing slashes and the query string stripped.
 * HN item pages keep their `id`, otherwise every Ask HN post collapses into one entry
 * because they all share the path `/item`.
 */
export function dedupeKey(item: NewsItem): string {
  try {
    const u = new URL(item.url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    const id = u.searchParams.get('id');
    if (path === '/item' && id) return `${host}${path}?id=${id}`;
    return `${host}${path}`;
  } catch {
    return normalizeTitle(item.title);
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Round-robin one item per group per round, in the order the groups are given, until
 * `limit` items are picked or every group is exhausted.
 *
 * Deduping is by item id, then canonical URL, then normalized title — the same HN story
 * genuinely does match two category queries at once (verified live: one story appeared in
 * both the AI and front_page results with different point counts).
 */
export function interleave(groups: NewsGroup[], limit: number): NewsItem[] {
  const cursors = new Array<number>(groups.length).fill(0);
  const seen = new Set<string>();
  const picked: NewsItem[] = [];

  let progressed = true;
  while (picked.length < limit && progressed) {
    // Guards against starved groups spinning forever once everything is deduped out.
    progressed = false;

    for (let g = 0; g < groups.length; g++) {
      if (picked.length >= limit) break;
      const items = groups[g]?.items ?? [];
      let cursor = cursors[g] ?? 0;

      // A duplicate costs a cursor step, never the group's slot in this round —
      // otherwise a single dupe silently shrinks the result below `limit`.
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        if (!item) continue;

        const keys = [`i:${item.id}`, `u:${dedupeKey(item)}`, `t:${normalizeTitle(item.title)}`];
        if (keys.some((k) => seen.has(k))) continue;

        keys.forEach((k) => seen.add(k));
        picked.push(item);
        progressed = true;
        break;
      }

      cursors[g] = cursor;
    }
  }

  return picked;
}
