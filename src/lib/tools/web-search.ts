const BASE = 'https://api.search.brave.com/res/v1/web/search';

export async function webSearch(query: string, braveApiKey: string): Promise<string> {
  if (!braveApiKey) return 'Error: Brave Search API key not configured';
  try {
    const res = await fetch(`${BASE}?q=${encodeURIComponent(query)}&count=5`, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': braveApiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return `Error: Brave Search returned ${res.status}`;
    const data = (await res.json()) as {
      web: { results: { title: string; url: string; description: string }[] };
    };
    return data.web.results
      .map((r, i) => `${i + 1}. ${r.title} — ${r.description} (${r.url})`)
      .join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
