const BASE = 'https://en.wikipedia.org/api/rest_v1';

export async function wikipediaSummary(title: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/page/summary/${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return `Error: Wikipedia returned ${res.status}`;
    const data = (await res.json()) as {
      extract: string;
      content_urls: { desktop: { page: string } };
    };
    const extract = data.extract.slice(0, 500);
    return `${extract}\n${data.content_urls.desktop.page}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
