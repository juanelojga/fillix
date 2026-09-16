import { get, writable } from 'svelte/store';
import type { MessageResponse, NewsItem, NewsSourceFailure, NewsSummary } from '../../types';
import { getNewsCache, setNewsCache } from '../../lib/storage';
import { ollamaConfig } from './settings';

export type FeedState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; fetchedAt: number; degraded: NewsSourceFailure[] }
  | { status: 'error'; error: string };

/**
 * There is deliberately no 'idle' member: absence from the record IS idle, which makes
 * `summaries[id] === undefined` the correct "should I start?" test.
 */
export type SummaryState =
  | { status: 'fetching' }
  | { status: 'summarizing'; model: string }
  | { status: 'ready'; summary: NewsSummary; model: string; elapsedMs: number }
  | { status: 'error'; stage: 'fetch' | 'summarize'; error: string; model: string; url: string };

/**
 * All News state lives here, not in component runes, because bits-ui unmounts
 * TabsContent when its tab is inactive. A rune would be destroyed on every tab switch,
 * taking an open row and a 20-second summary with it — and an in-flight await owned by
 * a component would write into a destroyed instance and be silently discarded.
 */
export const newsItems = writable<NewsItem[]>([]);
export const feedState = writable<FeedState>({ status: 'idle' });
export const expandedItemId = writable<string | null>(null);
export const summaries = writable<Record<string, SummaryState>>({});

/** Bumped on every refresh so a reply from a superseded run cannot land on a new list. */
let generation = 0;

function setSummary(id: string, state: SummaryState): void {
  summaries.update((all) => ({ ...all, [id]: state }));
}

async function send(message: unknown): Promise<MessageResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse | undefined;
    return response ?? { ok: false, error: 'No response from the extension service worker' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshNews(): Promise<void> {
  if (get(feedState).status === 'loading') return;
  generation += 1;
  const gen = generation;

  expandedItemId.set(null);
  feedState.set({ status: 'loading' });

  const response = await send({ type: 'NEWS_REFRESH' });
  if (gen !== generation) return;

  if (response.ok && 'news' in response) {
    newsItems.set(response.news);
    // Old ids no longer exist; keeping their summaries would just leak.
    summaries.set({});
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: response.degraded });
    void persistCache();
    return;
  }

  feedState.set({
    status: 'error',
    error: response.ok ? 'Unexpected response shape' : response.error,
  });
}

export function setExpanded(id: string | null): void {
  expandedItemId.set(id);
  // A cache hit, an in-flight run, or an error the user is re-reading: all no-ops.
  if (id !== null && get(summaries)[id] === undefined) void summarize(id);
}

/**
 * Two round trips on purpose. The user sees "Fetching…" then "Summarizing…" instead of
 * 25 unchanging seconds, the failure stage is intrinsic rather than guessed, and each
 * service-worker invocation is short enough to dodge MV3's idle kill.
 */
export async function summarize(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const item = get(newsItems).find((i) => i.id === id);
  if (!item) return;
  if (!opts.force && get(summaries)[id] !== undefined) return;

  const gen = generation;
  const model = get(ollamaConfig)?.model ?? 'the local model';
  const started = Date.now();

  setSummary(id, { status: 'fetching' });
  const article = await send({ type: 'NEWS_ARTICLE', item });
  if (gen !== generation) return;
  if (!article.ok) {
    setSummary(id, { status: 'error', stage: 'fetch', error: article.error, model, url: item.url });
    return;
  }
  if (!('article' in article)) {
    setSummary(id, {
      status: 'error',
      stage: 'fetch',
      error: 'Unexpected response shape',
      model,
      url: item.url,
    });
    return;
  }

  setSummary(id, { status: 'summarizing', model });
  const result = await send({
    type: 'NEWS_SUMMARIZE',
    title: item.title,
    source: item.source,
    text: article.article.text,
  });
  if (gen !== generation) return;
  if (!result.ok) {
    setSummary(id, {
      status: 'error',
      stage: 'summarize',
      error: result.error,
      model,
      url: item.url,
    });
    return;
  }
  if (!('summary' in result)) {
    setSummary(id, {
      status: 'error',
      stage: 'summarize',
      error: 'Unexpected response shape',
      model,
      url: item.url,
    });
    return;
  }

  setSummary(id, {
    status: 'ready',
    summary: result.summary,
    model,
    elapsedMs: Date.now() - started,
  });
  void persistCache();
}

/** Restores the last refresh from disk. Reads storage only — never the network. */
export async function hydrateNewsCache(): Promise<void> {
  if (get(newsItems).length > 0) return;
  const cache = await getNewsCache();
  if (!cache || cache.items.length === 0) return;

  newsItems.set(cache.items);
  summaries.set(
    Object.fromEntries(
      Object.entries(cache.summaries).map(([id, summary]) => [
        id,
        { status: 'ready', summary, model: '', elapsedMs: 0 } satisfies SummaryState,
      ]),
    ),
  );
  feedState.set({ status: 'ready', fetchedAt: cache.fetchedAt, degraded: [] });
}

async function persistCache(): Promise<void> {
  const state = get(feedState);
  const ready: Record<string, NewsSummary> = {};
  for (const [id, s] of Object.entries(get(summaries))) {
    // Only completed summaries: a restored 'fetching' would be a permanently stuck row.
    if (s.status === 'ready') ready[id] = s.summary;
  }
  await setNewsCache({
    items: get(newsItems),
    fetchedAt: state.status === 'ready' ? state.fetchedAt : Date.now(),
    summaries: ready,
  });
}
