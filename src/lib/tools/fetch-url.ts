export async function fetchUrl(url: string): Promise<string> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'Error: URL must start with http:// or https://';
  }
  try {
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return `Error: fetch returned ${res.status}`;
    const html = await res.text();
    const text = html
      // Bodies first: stripping only the tags would inline all the JS and CSS source,
      // eating the 3000-char budget before the article starts.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/gs, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 3000);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
