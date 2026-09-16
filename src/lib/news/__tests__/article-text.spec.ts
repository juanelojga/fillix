import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../tools/fetch-url', () => ({ fetchUrl: vi.fn() }));

import { articleFailureMessage, resolveArticleText } from '../article-text';
import { fetchUrl } from '../../tools/fetch-url';
import type { NewsItem } from '../../../types';

function item(snippet: string): NewsItem {
  return {
    id: 'hn:1',
    category: 'ai',
    title: 'A story',
    url: 'https://example.com/story',
    source: 'example.com',
    meta: '1 point',
    publishedAt: '2026-09-16T09:00:00Z',
    snippet,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('resolveArticleText', () => {
  it('uses a long snippet without touching the network', async () => {
    const result = await resolveArticleText(item('x'.repeat(700)));

    expect(result).toEqual({ ok: true, text: 'x'.repeat(700), origin: 'snippet' });
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it('fetches the article when the snippet is thin', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('a'.repeat(500));
    const result = await resolveArticleText(item(''));

    expect(result).toEqual({ ok: true, text: 'a'.repeat(500), origin: 'article' });
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com/story');
  });

  // fetchUrl signals failure with a string, so the prefix check is the only guard
  // between an HTTP error and the model confidently summarizing it.
  it('falls back to a usable snippet when the fetch fails', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('Error: fetch returned 403');
    const result = await resolveArticleText(item('s'.repeat(300)));

    expect(result).toEqual({ ok: true, text: 's'.repeat(300), origin: 'snippet' });
  });

  it('reports fetch-failed when there is no snippet to fall back to', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('Error: fetch returned 403');
    expect(await resolveArticleText(item(''))).toEqual({ ok: false, reason: 'fetch-failed' });
  });

  it('reports too-short when the page yielded almost no text', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('tiny shell');
    expect(await resolveArticleText(item(''))).toEqual({ ok: false, reason: 'too-short' });
  });

  it('never returns an Error string as article text', async () => {
    vi.mocked(fetchUrl).mockResolvedValue(`Error: ${'x'.repeat(500)}`);
    const result = await resolveArticleText(item(''));

    expect(result.ok).toBe(false);
  });
});

describe('articleFailureMessage', () => {
  it('words each reason differently', () => {
    expect(articleFailureMessage('fetch-failed')).toBe('Could not fetch this article');
    expect(articleFailureMessage('too-short')).toContain('too little readable text');
  });
});
