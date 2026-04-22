const BASE = 'https://news.google.com/rss/search';

export async function newsFeed(topic: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}?q=${encodeURIComponent(topic)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return `Error: news feed returned ${res.status}`;
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 5);
    if (items.length === 0) return 'Error: no news items found';
    return items
      .map((item, i) => {
        const title = item.querySelector('title')?.textContent ?? '';
        const pubDate = item.querySelector('pubDate')?.textContent ?? '';
        const link = item.querySelector('link')?.textContent ?? '';
        return `${i + 1}. ${title} — ${pubDate} (${link})`;
      })
      .join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
