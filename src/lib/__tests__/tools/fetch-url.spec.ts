// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUrl } from '../../tools/fetch-url';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('fetchUrl', () => {
  it('returns first 3000 chars of stripped text from a successful fetch', async () => {
    const body = '<html><body><p>' + 'a'.repeat(4000) + '</p></body></html>';
    mockFetch.mockResolvedValue(new Response(body, { status: 200 }));

    const result = await fetchUrl('https://example.com');

    expect(result.length).toBeLessThanOrEqual(3000);
    expect(result).not.toContain('<');
  });

  it('strips HTML tags from the fetched body', async () => {
    mockFetch.mockResolvedValue(new Response('<h1>Hello</h1><p>World</p>', { status: 200 }));

    const result = await fetchUrl('https://example.com');

    expect(result).not.toContain('<h1>');
    expect(result).not.toContain('<p>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('fetches with credentials: omit', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    await fetchUrl('https://example.com/page');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('omit');
  });

  it('returns Error: string for non-http/https URLs — never throws', async () => {
    const result = await fetchUrl('ftp://example.com/file');

    expect(result).toMatch(/^Error:/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns Error: string for non-2xx response — never throws', async () => {
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const result = await fetchUrl('https://example.com/private');

    expect(result).toMatch(/^Error:/);
  });

  it('returns Error: string on network failure — never throws', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await fetchUrl('https://example.com');

    expect(result).toMatch(/^Error:/);
  });
});
