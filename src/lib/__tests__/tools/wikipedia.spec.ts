// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wikipediaSummary } from '../../tools/wikipedia';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('wikipediaSummary', () => {
  it('returns extract truncated to 500 chars plus the desktop URL', async () => {
    const longExtract = 'x'.repeat(600);
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          extract: longExtract,
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/TypeScript' } },
        }),
        { status: 200 },
      ),
    );

    const result = await wikipediaSummary('TypeScript');

    expect(result).toContain('x'.repeat(500));
    expect(result).not.toContain('x'.repeat(501));
    expect(result).toContain('https://en.wikipedia.org/wiki/TypeScript');
  });

  it('returns full extract when shorter than 500 chars', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          extract: 'Short summary.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Short' } },
        }),
        { status: 200 },
      ),
    );

    const result = await wikipediaSummary('Short');

    expect(result).toContain('Short summary.');
  });

  it('GETs the Wikipedia REST v1 summary endpoint with the encoded title', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          extract: 'summary',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Node.js' } },
        }),
        { status: 200 },
      ),
    );

    await wikipediaSummary('Node.js');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('en.wikipedia.org/api/rest_v1/page/summary/');
    expect(url).toContain(encodeURIComponent('Node.js'));
  });

  it('returns an Error: string on non-2xx response — never throws', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const result = await wikipediaSummary('NonExistentPage12345');

    expect(result).toMatch(/^Error:/);
  });

  it('returns an Error: string on network failure — never throws', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await wikipediaSummary('Anything');

    expect(result).toMatch(/^Error:/);
  });
});
