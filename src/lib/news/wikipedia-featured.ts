import type { NewsItem } from '../../types';

const ENDPOINT = 'https://en.wikipedia.org/api/rest_v1/feed/featured';

/** The subset of the featured feed we rely on. Private to this adapter. */
interface FeaturedPage {
  titles?: { normalized?: string };
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

interface OnThisDayEntry {
  year?: number;
  text?: string;
  pages?: FeaturedPage[];
}

interface FeaturedFeed {
  tfa?: FeaturedPage;
  mostread?: { articles?: FeaturedPage[] };
  onthisday?: OnThisDayEntry[];
  // `dyk` is deliberately ignored: its entries carry only `html` and `text`, with no
  // `pages`, so they have neither a URL nor an extract.
}

export function buildFeaturedUrl(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${ENDPOINT}/${year}/${month}/${day}`;
}

/** Throws on failure — see the convention note in `hacker-news.ts`. */
export async function fetchWikipediaCuriosities(
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<NewsItem[]> {
  const res = await fetch(buildFeaturedUrl(now), { credentials: 'omit', signal });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);

  const feed = (await res.json()) as FeaturedFeed;
  const iso = now.toISOString();
  const items: NewsItem[] = [];

  // Priority order. `onthisday` goes last: it skews toward grim historical events,
  // which reads oddly under a "Curiosities" badge.
  const featured = toItem(feed.tfa, 'wiki:tfa', 'Featured article', iso);
  if (featured) items.push(featured);

  (feed.mostread?.articles ?? []).forEach((page, i) => {
    const item = toItem(page, `wiki:mostread:${i}`, 'Most read', iso);
    if (item) items.push(item);
  });

  (feed.onthisday ?? []).forEach((entry, i) => {
    const page = entry.pages?.[0];
    const label = entry.year === undefined ? 'On this day' : `On this day · ${entry.year}`;
    const item = toItem(page, `wiki:onthisday:${i}`, label, iso);
    if (!item) return;
    // The entry's own sentence is a better summary than the linked article's lede.
    items.push(entry.text ? { ...item, snippet: entry.text } : item);
  });

  return items;
}

function toItem(
  page: FeaturedPage | undefined,
  id: string,
  meta: string,
  publishedAt: string,
): NewsItem | null {
  const url = page?.content_urls?.desktop?.page;
  const title = page?.titles?.normalized;
  if (!page || !url || !title) return null;

  return {
    id,
    category: 'curiosities',
    title,
    url,
    source: 'Wikipedia',
    meta,
    publishedAt,
    snippet: (page.extract ?? '').trim(),
  };
}
