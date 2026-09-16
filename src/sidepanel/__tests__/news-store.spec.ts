import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const storage: Record<string, unknown> = {};
const mockSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          list.filter((k) => storage[k] !== undefined).map((k) => [k, storage[k]]),
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storage, items);
      }),
    },
  },
  runtime: { sendMessage: mockSendMessage },
});

import {
  expandedItemId,
  feedState,
  hydrateNewsCache,
  newsItems,
  refreshNews,
  setExpanded,
  summaries,
  summarize,
} from '../stores/news';
import type { NewsItem } from '../../types';

function item(id: string): NewsItem {
  return {
    id,
    category: 'ai',
    title: `Story ${id}`,
    url: `https://example.com/${id}`,
    source: 'example.com',
    meta: '1 point',
    publishedAt: '2026-09-16T09:00:00Z',
    snippet: '',
  };
}

const ARTICLE_OK = { ok: true, article: { text: 'body', origin: 'article' } };
const SUMMARY_OK = { ok: true, summary: { summary: 'It happened.', keyPoints: ['a'] } };

beforeEach(() => {
  // Scoped to the message mock: resetAllMocks would also wipe the storage stubs'
  // implementations, leaving chrome.storage.local.get returning undefined.
  mockSendMessage.mockReset();
  for (const key of Object.keys(storage)) delete storage[key];
  newsItems.set([]);
  feedState.set({ status: 'idle' });
  expandedItemId.set(null);
  summaries.set({});
});

describe('refreshNews', () => {
  it('populates items and records the degraded sources', async () => {
    const degraded = [{ category: 'technology' as const, source: 'Hacker News', error: 'down' }];
    mockSendMessage.mockResolvedValue({ ok: true, news: [item('a')], degraded });

    await refreshNews();

    expect(get(newsItems)).toHaveLength(1);
    expect(get(feedState)).toMatchObject({ status: 'ready', degraded });
  });

  it('carries the worker error message through verbatim', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'No news sources responded' });

    await refreshNews();

    expect(get(feedState)).toEqual({ status: 'error', error: 'No news sources responded' });
    expect(get(newsItems)).toEqual([]);
  });

  it('reports a missing worker rather than hanging', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    await refreshNews();
    expect(get(feedState)).toMatchObject({ status: 'error' });
  });

  it('collapses the open row and clears stale summaries', async () => {
    newsItems.set([item('a')]);
    expandedItemId.set('a');
    summaries.set({
      a: { status: 'ready', summary: { summary: 'old', keyPoints: [] }, model: 'm', elapsedMs: 1 },
    });
    mockSendMessage.mockResolvedValue({ ok: true, news: [item('b')], degraded: [] });

    await refreshNews();

    expect(get(expandedItemId)).toBeNull();
    expect(get(summaries)).toEqual({});
  });

  it('persists the refresh to storage', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, news: [item('a')], degraded: [] });
    await refreshNews();

    expect(storage['news']).toMatchObject({ items: [item('a')] });
  });
});

describe('setExpanded', () => {
  it('starts one article request for an unseen item', async () => {
    newsItems.set([item('a')]);
    mockSendMessage.mockResolvedValueOnce(ARTICLE_OK).mockResolvedValueOnce(SUMMARY_OK);

    setExpanded('a');
    await vi.waitFor(() => expect(get(summaries)['a']?.status).toBe('ready'));

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage.mock.calls[0]?.[0]).toMatchObject({ type: 'NEWS_ARTICLE' });
    expect(mockSendMessage.mock.calls[1]?.[0]).toMatchObject({ type: 'NEWS_SUMMARIZE' });
  });

  // The whole point of the cache: re-opening a story must cost nothing.
  it('sends nothing when the summary is already cached', async () => {
    newsItems.set([item('a')]);
    summaries.set({
      a: { status: 'ready', summary: { summary: 'x', keyPoints: [] }, model: 'm', elapsedMs: 1 },
    });

    setExpanded('a');

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not auto-retry a row the user is re-reading after a failure', () => {
    newsItems.set([item('a')]);
    summaries.set({
      a: { status: 'error', stage: 'fetch', error: 'boom', model: 'm', url: 'https://x' },
    });

    setExpanded('a');

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('summarize', () => {
  it('moves through fetching then summarizing before ready', async () => {
    newsItems.set([item('a')]);
    const seen: string[] = [];
    const unsubscribe = summaries.subscribe((all) => {
      const status = all['a']?.status;
      if (status && seen[seen.length - 1] !== status) seen.push(status);
    });
    mockSendMessage.mockResolvedValueOnce(ARTICLE_OK).mockResolvedValueOnce(SUMMARY_OK);

    await summarize('a');
    unsubscribe();

    expect(seen).toEqual(['fetching', 'summarizing', 'ready']);
  });

  it('marks a failed article fetch with stage fetch', async () => {
    newsItems.set([item('a')]);
    mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'Could not fetch this article' });

    await summarize('a');

    expect(get(summaries)['a']).toMatchObject({
      stage: 'fetch',
      error: 'Could not fetch this article',
    });
  });

  it('marks a failed generation with stage summarize', async () => {
    newsItems.set([item('a')]);
    mockSendMessage
      .mockResolvedValueOnce(ARTICLE_OK)
      .mockResolvedValueOnce({ ok: false, error: 'signal timed out' });

    await summarize('a');

    expect(get(summaries)['a']).toMatchObject({ stage: 'summarize', error: 'signal timed out' });
  });

  it('re-runs when forced, which is what Try again does', async () => {
    newsItems.set([item('a')]);
    summaries.set({
      a: { status: 'error', stage: 'fetch', error: 'boom', model: 'm', url: 'https://x' },
    });
    mockSendMessage.mockResolvedValueOnce(ARTICLE_OK).mockResolvedValueOnce(SUMMARY_OK);

    await summarize('a', { force: true });

    expect(get(summaries)['a']?.status).toBe('ready');
  });

  // Without the generation guard a slow summary would land on an unrelated story.
  it('discards a reply that arrives after a newer refresh', async () => {
    newsItems.set([item('a')]);
    let releaseArticle: (value: unknown) => void = () => {};
    mockSendMessage.mockImplementationOnce(
      () => new Promise((resolve) => (releaseArticle = resolve)),
    );

    const pending = summarize('a');
    mockSendMessage.mockResolvedValue({ ok: true, news: [item('b')], degraded: [] });
    await refreshNews();

    releaseArticle(ARTICLE_OK);
    await pending;

    expect(get(summaries)).toEqual({});
  });

  it('replaces the summaries record rather than mutating it', async () => {
    newsItems.set([item('a')]);
    const before = get(summaries);
    mockSendMessage.mockResolvedValueOnce(ARTICLE_OK).mockResolvedValueOnce(SUMMARY_OK);

    await summarize('a');

    expect(get(summaries)).not.toBe(before);
  });
});

describe('hydrateNewsCache', () => {
  it('restores items and ready summaries without touching the network', async () => {
    storage['news'] = {
      items: [item('a')],
      fetchedAt: 1_700_000_000_000,
      summaries: { a: { summary: 'Cached.', keyPoints: [] } },
    };

    await hydrateNewsCache();

    expect(get(newsItems)).toHaveLength(1);
    expect(get(summaries)['a']).toMatchObject({ status: 'ready' });
    expect(get(feedState)).toMatchObject({ status: 'ready', fetchedAt: 1_700_000_000_000 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing was cached', async () => {
    await hydrateNewsCache();
    expect(get(feedState)).toEqual({ status: 'idle' });
  });
});
