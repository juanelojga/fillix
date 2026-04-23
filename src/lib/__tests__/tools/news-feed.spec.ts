// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsFeed } from '../../tools/news-feed';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRssResponse(items: { title: string; pubDate: string; link: string }[]): Response {
  const itemsXml = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><pubDate>${i.pubDate}</pubDate><link>${i.link}</link></item>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0"?><rss><channel>${itemsXml}</channel></rss>`;
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
}

const sampleItems = [
  {
    title: 'AI News 1',
    pubDate: 'Mon, 21 Apr 2026 10:00:00 GMT',
    link: 'https://news.example.com/1',
  },
  {
    title: 'AI News 2',
    pubDate: 'Mon, 21 Apr 2026 09:00:00 GMT',
    link: 'https://news.example.com/2',
  },
  {
    title: 'AI News 3',
    pubDate: 'Mon, 21 Apr 2026 08:00:00 GMT',
    link: 'https://news.example.com/3',
  },
  {
    title: 'AI News 4',
    pubDate: 'Mon, 21 Apr 2026 07:00:00 GMT',
    link: 'https://news.example.com/4',
  },
  {
    title: 'AI News 5',
    pubDate: 'Mon, 21 Apr 2026 06:00:00 GMT',
    link: 'https://news.example.com/5',
  },
  {
    title: 'AI News 6',
    pubDate: 'Mon, 21 Apr 2026 05:00:00 GMT',
    link: 'https://news.example.com/6',
  },
];

describe('newsFeed', () => {
  it('returns at most 5 items as a numbered list', async () => {
    mockFetch.mockResolvedValue(makeRssResponse(sampleItems));

    const result = await newsFeed('AI');

    const lines = result.split('\n').filter(Boolean);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^1\./);
    expect(lines[4]).toMatch(/^5\./);
  });

  it('each line contains title, pubDate, and link', async () => {
    mockFetch.mockResolvedValue(makeRssResponse(sampleItems.slice(0, 1)));

    const result = await newsFeed('AI');

    expect(result).toContain('AI News 1');
    expect(result).toContain('Mon, 21 Apr 2026 10:00:00 GMT');
    expect(result).toContain('https://news.example.com/1');
  });

  it('encodes the topic in the RSS query string', async () => {
    mockFetch.mockResolvedValue(makeRssResponse([]));

    await newsFeed('machine learning');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent('machine learning'));
  });

  it('returns Error: string on non-2xx response — never throws', async () => {
    mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

    const result = await newsFeed('AI');

    expect(result).toMatch(/^Error:/);
  });

  it('returns Error: string on network failure — never throws', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await newsFeed('AI');

    expect(result).toMatch(/^Error:/);
  });
});
