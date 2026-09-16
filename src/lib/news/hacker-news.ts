import type { NewsCategory, NewsItem } from '../../types';
import type { HnQuery } from './categories';
import { formatRelativeTime, hostLabel } from './format';

const ENDPOINT = 'https://hn.algolia.com/api/v1/search';
const HITS_PER_PAGE = 15;

/** The subset of an Algolia hit we rely on. Not a contract — private to this adapter. */
interface AlgoliaHit {
  objectID?: string;
  title?: string | null;
  url?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
  story_text?: string | null;
}

export function buildHnUrl(query: HnQuery, now: Date): string {
  const params = new URLSearchParams({ tags: query.tags, hitsPerPage: String(HITS_PER_PAGE) });
  if (query.query) params.set('query', query.query);

  const filters: string[] = [];
  if (query.windowSeconds !== undefined) {
    const since = Math.floor(now.getTime() / 1000) - query.windowSeconds;
    filters.push(`created_at_i>${since}`);
  }
  if (query.minPoints !== undefined) filters.push(`points>${query.minPoints}`);
  if (filters.length > 0) params.set('numericFilters', filters.join(','));

  return `${ENDPOINT}?${params.toString()}`;
}

/**
 * Throws on failure — deliberately unlike `src/lib/tools/*.ts`, which return
 * "Error: ..." strings. Those strings are LLM-facing prose; this is code-facing and
 * feeds Promise.allSettled, which needs a rejection to mark a source as degraded.
 * Returning an error string here would produce a NewsItem titled "Error: fetch returned 503".
 */
export async function fetchHackerNews(
  category: NewsCategory,
  query: HnQuery,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<NewsItem[]> {
  const res = await fetch(buildHnUrl(query, now), { credentials: 'omit', signal });
  if (!res.ok) throw new Error(`Hacker News returned ${res.status}`);

  const body = (await res.json()) as { hits?: AlgoliaHit[] };
  const hits = Array.isArray(body.hits) ? body.hits : [];

  return hits
    .filter((hit): hit is AlgoliaHit & { objectID: string } => Boolean(hit.objectID && hit.title))
    .map((hit) => toNewsItem(category, hit, now));
}

function toNewsItem(
  category: NewsCategory,
  hit: AlgoliaHit & { objectID: string },
  now: Date,
): NewsItem {
  // Ask HN and similar self-posts carry no outbound url — link to the HN thread instead.
  const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const points = hit.points ?? 0;
  const comments = hit.num_comments ?? 0;
  const publishedAt = hit.created_at ?? '';

  const meta = [
    `${points} ${points === 1 ? 'point' : 'points'}`,
    `${comments} ${comments === 1 ? 'comment' : 'comments'}`,
    formatRelativeTime(publishedAt, now),
  ]
    .filter((part) => part !== '')
    .join(' · ');

  return {
    id: `hn:${hit.objectID}`,
    category,
    title: hit.title ?? '',
    url,
    source: hostLabel(url),
    meta,
    publishedAt,
    snippet: (hit.story_text ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}
