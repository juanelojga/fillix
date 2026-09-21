import type { SearchResult } from './search';

/**
 * Tavily's results → the text the ReAct loop reads.
 *
 * Its own module because the block shape is a contract with two readers that change on different
 * schedules: the model, and `ToolCallBlock.svelte`'s `parseSearch`. Burying the format in an
 * expression inside the tool would leave the panel's parser agreeing with a string literal
 * nobody would think to look at.
 */

/**
 * Matches `PROFILE_SEARCH_CHARS`, and for the reason stated there: a tool result is appended to
 * the conversation as a user message and the ReAct loop runs up to eight times, so results
 * accumulate across a turn in a way a single prompt never does.
 *
 * It is a ceiling rather than a target. Five results of a title, a URL and a capped snippet come
 * to roughly 1 900 characters, so this only ever fires on one pathological page — which is the
 * point, because the alternative is that page eating the other four.
 */
export const TAVILY_RESULT_CHARS = 2_500;

/** One or two sentences: enough to judge relevance, not enough to be mistaken for the answer.
 *  The model has `fetch_url` for the one result that turns out to matter. */
export const SNIPPET_CHARS = 300;

/** A newline inside a title or a snippet would turn one result into two blocks and corrupt every
 *  block after it, since the parser reads position within a block. */
const flatten = (text: string): string => text.replace(/\s+/g, ' ').trim();

function clip(text: string): string {
  if (text.length <= SNIPPET_CHARS) return text;
  const cut = text.slice(0, SNIPPET_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  // The ellipsis is a signal to the model that fetch_url would get more, not decoration.
  return `${(lastSpace > SNIPPET_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Three lines per result, blank-line separated:
 *
 *     1. Svelte 5 release notes
 *     https://svelte.dev/blog/svelte-5-is-alive · 2026-09-14
 *     Svelte 5 introduces runes, a new reactivity system…
 *
 * Deliberately *not* the `N. Title — snippet (url)` one-liner `news_feed` emits, even though
 * `parseList` already reads that shape. Its regex has a lazy title group, so a result titled
 * "Vue 3 — the Composition API guide" splits at the first em dash and renders as "Vue 3" with the
 * remainder swallowed into the snippet. Feed titles rarely contain a dash; web page titles contain
 * one constantly, and a URL with parentheses in it is just as common. Putting the URL on a line of
 * its own makes the parse unambiguous for any title at all, and reads better to the model.
 *
 * Whole blocks are dropped to fit the budget, never part of one: a half-block loses the line the
 * parser needs, so the panel would show four results while the model was reasoning about five.
 *
 * The first block is kept even when it alone exceeds the budget, for the reason `retrieve.ts`
 * states about its best chunk: returning nothing would make the model answer from thin air, and
 * the caller cannot tell an over-budget result from a web that had no answer.
 */
export function formatSearchResults(results: SearchResult[]): string {
  const blocks = results.map((result, i) => {
    const date = flatten(result.publishedDate);
    const location = date ? `${result.url} · ${date}` : result.url;
    return `${i + 1}. ${flatten(result.title)}\n${location}\n${clip(flatten(result.content))}`;
  });

  const kept: string[] = [];
  let used = 0;
  for (const block of blocks) {
    const cost = block.length + (kept.length > 0 ? 2 : 0);
    if (kept.length > 0 && used + cost > TAVILY_RESULT_CHARS) break;
    kept.push(block);
    used += cost;
  }
  return kept.join('\n\n');
}
