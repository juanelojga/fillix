import type { NewsItem, NewsSourceFailure } from '../../types';
import { HN_QUERIES } from './categories';
import { fetchHackerNews } from './hacker-news';
import { interleave, type NewsGroup } from './interleave';
import { fetchWikipediaCuriosities } from './wikipedia-featured';

export const TOTAL_ITEMS = 6;

/** Shorter than fetchUrl's 15s: this blocks a button press, and allSettled waits
 *  for the slowest source. */
const PER_SOURCE_TIMEOUT_MS = 10_000;

export interface NewsRefreshResult {
  items: NewsItem[];
  degraded: NewsSourceFailure[];
}

interface SourceTask {
  category: NewsSourceFailure['category'];
  source: string;
  run: (signal: AbortSignal) => Promise<NewsItem[]>;
}

export async function refreshNews(now: Date = new Date()): Promise<NewsRefreshResult> {
  const tasks: SourceTask[] = [
    {
      category: 'ai',
      source: 'Hacker News',
      run: (s) => fetchHackerNews('ai', HN_QUERIES.ai, s, now),
    },
    {
      category: 'technology',
      source: 'Hacker News',
      run: (s) => fetchHackerNews('technology', HN_QUERIES.technology, s, now),
    },
    {
      category: 'software-development',
      source: 'Hacker News',
      run: (s) =>
        fetchHackerNews('software-development', HN_QUERIES['software-development'], s, now),
    },
    {
      category: 'curiosities',
      source: 'Wikipedia',
      run: (s) => fetchWikipediaCuriosities(s, now),
    },
  ];

  // allSettled, never all: a single 503 must not discard the three results that arrived.
  // Every signal is created inside this map so all four clocks start together.
  const settled = await Promise.allSettled(
    tasks.map((task) => task.run(AbortSignal.timeout(PER_SOURCE_TIMEOUT_MS))),
  );

  const groups: NewsGroup[] = [];
  const degraded: NewsSourceFailure[] = [];

  settled.forEach((result, i) => {
    const task = tasks[i];
    if (!task) return;
    if (result.status === 'fulfilled' && result.value.length > 0) {
      groups.push({ category: task.category, items: result.value });
      return;
    }
    degraded.push({
      category: task.category,
      source: task.source,
      // An empty feed is not an error, but it is the same outcome for the reader.
      error:
        result.status === 'rejected'
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : 'returned no items',
    });
  });

  const items = interleave(groups, TOTAL_ITEMS);
  if (items.length === 0) {
    const names = [...new Set(degraded.map((d) => d.source))].join(', ');
    throw new Error(`No news sources responded (${names})`);
  }

  return { items, degraded };
}
