import { fetchHackerNews } from '../news/hacker-news';

const MAX_ITEMS = 5;
const TIMEOUT_MS = 15_000;

/**
 * Formats Hacker News results for the chat ReAct loop.
 *
 * This used to read Google News RSS and parse it with `new DOMParser()`, which does
 * not exist in an MV3 service worker — the tool returned "Error: DOMParser is not
 * defined" every time in production. Hacker News is JSON, so nothing here needs a DOM.
 */
export async function newsFeed(topic: string): Promise<string> {
  try {
    const items = await fetchHackerNews(
      'technology',
      { tags: 'story', query: topic, minPoints: 10 },
      AbortSignal.timeout(TIMEOUT_MS),
    );
    if (items.length === 0) return 'Error: no news items found';
    return items
      .slice(0, MAX_ITEMS)
      .map((item, i) => `${i + 1}. ${item.title} — ${item.meta} (${item.url})`)
      .join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
