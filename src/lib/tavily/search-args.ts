/**
 * What the model is allowed to ask for, and the only module that distrusts what it emitted.
 *
 * Split from `search.ts` because the two change for different reasons: this file is reworded
 * whenever a small model phrases a call badly, that one whenever Tavily changes a parameter.
 *
 * It is also the single place that absorbs `chat-runner.ts`'s `detectToolCall` typing its args
 * as `Record<string, string>`. That is a promise `JSON.parse` does not keep — a model can hand
 * back a number, an array, `null` or a nested object — and every existing tool is immune only by
 * accident, because each reads one value and passes it somewhere that stringifies it. This is the
 * first tool with four arguments and a typed request body behind them.
 *
 * Every rule here fails *soft*: an unreadable optional argument is dropped and the search still
 * runs. A 400 from Tavily is a worse outcome than a search without a date filter, and unlike the
 * drafting path nothing downstream can be fabricated by a missing narrowing — the results are
 * still real results. The one hard failure is a missing query, because there is nothing to search
 * for.
 */

/** Tavily accepts `general`, `news` and `finance`. `finance` is not offered: it changes which
 *  index is searched, and a model that picks it for an ordinary question gets worse results. */
const TOPICS = ['general', 'news'] as const;
const TIME_RANGES = ['day', 'week', 'month', 'year'] as const;

/** Tavily's documented ceiling is 1 500 characters. */
const MAX_QUERY_CHARS = 1_500;

/** Tavily allows 300 include_domains. More than a handful from a model is a malfunction, not a
 *  research strategy, and each one narrows the search further. */
const MAX_DOMAINS = 8;

export interface SearchParams {
  query: string;
  topic?: (typeof TOPICS)[number];
  timeRange?: (typeof TIME_RANGES)[number];
  domains?: string[];
}

export type ParsedSearchArgs = { ok: true; params: SearchParams } | { ok: false; error: string };

/** `String(value)` on an object gives "[object Object]", which would then be searched for. */
function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Accepts a comma-separated string or a real array, because both arrive in practice: the prompt
 * asks for a string (a small model emits one far more reliably than a nested JSON array) and a
 * larger one sends the array anyway.
 */
function readDomains(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(readString) : readString(value).split(',');
  const cleaned = raw
    .map((entry) =>
      entry
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, ''),
    )
    // A bare word is a topic the model meant to search for, not a site to restrict to; passing
    // it through would return nothing at all and read as "the web has no answer".
    .filter((entry) => entry.includes('.') && !/\s/.test(entry));
  return [...new Set(cleaned)].slice(0, MAX_DOMAINS);
}

export function parseSearchArgs(args: Record<string, unknown>): ParsedSearchArgs {
  const query = readString(args['query']).replace(/\s+/g, ' ').trim();
  if (!query) return { ok: false, error: 'tavily_search needs a "query" argument.' };

  const params: SearchParams = { query: query.slice(0, MAX_QUERY_CHARS) };

  // Matched against the allowlist rather than passed through: "last week", "7d" and "recent" are
  // all things a model emits for time_range, and Tavily rejects every one of them with a 400.
  const topic = readString(args['topic']).trim().toLowerCase();
  if ((TOPICS as readonly string[]).includes(topic)) params.topic = topic as SearchParams['topic'];

  const timeRange = readString(args['time_range']).trim().toLowerCase();
  if ((TIME_RANGES as readonly string[]).includes(timeRange))
    params.timeRange = timeRange as SearchParams['timeRange'];

  const domains = readDomains(args['sites']);
  if (domains.length > 0) params.domains = domains;

  return { ok: true, params };
}
