import { getTavilyConfig } from '../storage';
import { parseSearchArgs } from '../tavily/search-args';
import { searchWeb } from '../tavily/search';
import { formatSearchResults } from '../tavily/search-results';
import { diagnoseTavilyFailure } from '../tavily/search-diagnostics';

/**
 * The chat tool that searches the live web.
 *
 * A thin orchestrator in the shape of `profile-search.ts`: gather the stored value the refusals
 * are decided from, hand the work to modules that each own one piece of it, and word the outcome
 * for a model. Nothing here knows Tavily's wire shape, its parameter names or its status codes.
 *
 * The first tool to take more than one argument, so it receives the whole record and lets
 * `search-args.ts` decide what any of it means.
 *
 * Three outcomes kept apart, the discipline `profile-search.ts` insists on. A failure comes back
 * as `Error: ` + wording we authored — never Tavily's own message, which is the one string in the
 * system that could echo the key back into chat history. A search the web genuinely has nothing
 * for comes back as plain prose, because "no results" and "search is broken" are very different
 * things to tell someone. Results come back as the blocks `search-results.ts` formats.
 */

const NOTHING_FOUND =
  'No web results for that query. Try different search words rather than answering from memory.';

const TIMEOUT_MS = 15_000;

export async function tavilySearch(args: Record<string, unknown>): Promise<string> {
  try {
    const { apiKey } = await getTavilyConfig();
    // Reachable even though `tool-prompt.ts` withholds the tool without a key: the user can
    // clear the key mid-conversation, and a model that saw it advertised earlier in the turn
    // will still call it.
    if (!apiKey) {
      const { summary, hint } = diagnoseTavilyFailure('No Tavily API key', '/search');
      return `Error: ${summary}. ${hint}`;
    }

    const parsed = parseSearchArgs(args);
    if (!parsed.ok) return `Error: ${parsed.error}`;

    const results = await searchWeb(apiKey, parsed.params, AbortSignal.timeout(TIMEOUT_MS));
    if (results.length === 0) return NOTHING_FOUND;

    return formatSearchResults(results);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const { summary, hint } = diagnoseTavilyFailure(raw, '/search');
    return `Error: ${summary}.${hint ? ` ${hint}` : ''}`;
  }
}
