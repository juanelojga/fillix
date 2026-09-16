import type { NewsArticleText, NewsItem } from '../../types';
import { fetchUrl } from '../tools/fetch-url';

/** Long enough to summarize on its own — skip the network entirely. */
const SNIPPET_SUFFICIENT = 600;
/** Below this, fetchUrl got a JS shell, a consent wall or a paywall, not an article. */
const MIN_ARTICLE_CHARS = 200;
/** Last-resort fallback when the fetch fails but the feed gave us something. */
const MIN_SNIPPET_CHARS = 120;

export type ArticleFailureReason = 'fetch-failed' | 'too-short';

export type ArticleTextResult =
  | ({ ok: true } & NewsArticleText)
  | { ok: false; reason: ArticleFailureReason };

/**
 * Decides what text the summarizer actually sees.
 *
 * The `"Error: "` check is load-bearing. `fetchUrl` never throws — it returns error
 * strings — and handing one to a small local model produces three sentences of
 * confident prose about an article it never read. That is the worst failure mode in
 * this feature, and the reason this policy lives in its own module.
 */
export async function resolveArticleText(item: NewsItem): Promise<ArticleTextResult> {
  const snippet = item.snippet.trim();
  if (snippet.length >= SNIPPET_SUFFICIENT) {
    return { ok: true, text: snippet, origin: 'snippet' };
  }

  const fetched = (await fetchUrl(item.url)).trim();
  const failed = fetched.startsWith('Error: ');
  if (!failed && fetched.length >= MIN_ARTICLE_CHARS) {
    return { ok: true, text: fetched, origin: 'article' };
  }

  if (snippet.length >= MIN_SNIPPET_CHARS) {
    return { ok: true, text: snippet, origin: 'snippet' };
  }

  return { ok: false, reason: failed ? 'fetch-failed' : 'too-short' };
}

export function articleFailureMessage(reason: ArticleFailureReason): string {
  return reason === 'fetch-failed'
    ? 'Could not fetch this article'
    : 'This page had too little readable text to summarize';
}
