import type { NewsCategory } from '../../types';

/** Fixed display order — also the round-robin order used by `interleave`. */
export const NEWS_CATEGORIES: NewsCategory[] = [
  'ai',
  'technology',
  'software-development',
  'curiosities',
];

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  ai: 'AI',
  technology: 'Technology',
  'software-development': 'Software dev',
  curiosities: 'Curiosities',
};

export const CATEGORY_BADGE_CLASS: Record<NewsCategory, string> = {
  ai: 'bg-violet-50 text-violet-700 border-violet-200',
  technology: 'bg-sky-50 text-sky-700 border-sky-200',
  'software-development': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  curiosities: 'bg-amber-50 text-amber-700 border-amber-200',
};

/** Parameters for one Hacker News Algolia query. */
export interface HnQuery {
  /** Algolia `tags` filter, e.g. 'story' or 'front_page'. */
  tags: string;
  /** Full-text query. Omitted for tag-only feeds. */
  query?: string;
  /** Only stories newer than this many seconds. Omitted for `front_page`. */
  windowSeconds?: number;
  /** Minimum score. Omitted for `front_page`, which is already curated. */
  minPoints?: number;
}

const DAY = 86_400;

/**
 * Query shapes chosen from measured hit counts, not guesses:
 * `query=programming` with points>30 returned 2 hits over 48h and 5 over a week,
 * while `show_hn` at points>50 over a week returns ~23. Keyword search is too thin
 * for the dev category.
 */
export const HN_QUERIES: Record<Exclude<NewsCategory, 'curiosities'>, HnQuery> = {
  ai: { tags: 'story', query: 'AI', windowSeconds: 2 * DAY, minPoints: 30 },
  technology: { tags: 'front_page' },
  'software-development': { tags: 'show_hn', windowSeconds: 7 * DAY, minPoints: 50 },
};
