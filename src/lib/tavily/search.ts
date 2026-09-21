import type { SearchParams } from './search-args';

/**
 * The Tavily client: the only module that touches the network and the only one that knows
 * Tavily's wire shape.
 *
 * Throws on failure, deliberately unlike `src/lib/tools/*.ts`, which return "Error: ..." strings.
 * The split is the one `news/hacker-news.ts` argues: those strings are LLM-facing prose, this is
 * code-facing, and the Settings badge needs a message it can run a diagnosis over rather than a
 * sentence already written for a model.
 *
 * `buildSearchBody` is exported and separately tested for the reason `buildHnUrl` is — the
 * request shape is the part that silently costs credits or returns the wrong index if it drifts,
 * and it is pure. It lives here rather than in its own file because `searchWeb` is its only
 * caller; what the *model* may ask for is a different concern and lives in `search-args.ts`.
 */

const SEARCH_URL = 'https://api.tavily.com/search';
const USAGE_URL = 'https://api.tavily.com/usage';

/**
 * Not the model's to set, and that is the whole mitigation for a ReAct loop that can search on
 * all eight of its iterations. `basic` is one credit against `advanced`'s two, and five results
 * is what `result-lines.ts` budgets for; a model that could raise either would eventually raise
 * both on one question.
 */
const MAX_RESULTS = 5;
const SEARCH_DEPTH = 'basic';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
}

/** The subset of Tavily's reply we rely on. Not a contract — private to this adapter. */
interface TavilyHit {
  title?: string | null;
  url?: string | null;
  content?: string | null;
  published_date?: string | null;
}

export function buildSearchBody(params: SearchParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: params.query,
    search_depth: SEARCH_DEPTH,
    max_results: MAX_RESULTS,
    // No synthesized answer: the model gets sources and writes its own reply, the same position
    // `answer-prompt.ts` takes about grounding. An `answer` field is the one thing in the reply a
    // model would quote wholesale without ever opening a result.
    include_answer: false,
    // Raw page text would blow the char budget five times over. `fetch_url` is how the model
    // reads the one result that turned out to matter.
    include_raw_content: false,
    // The model has no clock, so a result it cannot date is a result it cannot reason about.
    include_published_date: true,
    // One chunk per source rather than the default three: the snippet only has to be enough to
    // decide "is this the one?", and three chunks of it is most of the budget.
    chunks_per_source: 1,
  };
  // Omitted rather than sent as undefined — `JSON.stringify` would drop them anyway, but an
  // explicit key here reads as "we asked for the default" when we did not ask at all.
  if (params.topic) body['topic'] = params.topic;
  if (params.timeRange) body['time_range'] = params.timeRange;
  if (params.domains?.length) body['include_domains'] = params.domains;
  return body;
}

/**
 * Pulls Tavily's own message out of an error body so a diagnosis has one shape to match, exactly
 * as `extractOllamaError` does. Tavily has used more than one envelope — `{"detail":{"error":…}}`
 * for an auth failure, a bare string `detail` for a validation failure, a top-level `error` for a
 * malformed key — and without this every one of them reaches the badge as a JSON blob.
 */
export function extractTavilyError(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as {
      detail?: { error?: string } | string;
      error?: string;
    };
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (parsed.detail?.error) return parsed.detail.error;
    return parsed.error ?? body;
  } catch {
    return body;
  }
}

/**
 * `Retry-After` is folded into the message here rather than read in `search-diagnostics.ts`,
 * for the reason `summary-diagnostics.ts` states about first lines: that module is a pure
 * function of a string, so anything only the `Response` knows has to be baked in before it
 * gets there.
 */
async function failure(endpoint: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  const detail = extractTavilyError(body);
  const retry = res.headers.get('Retry-After');
  return new Error(
    `Tavily ${endpoint} returned ${res.status}` +
      (detail ? `: ${detail}` : '') +
      (retry ? ` (retry after ${retry}s)` : ''),
  );
}

/** The signal is a parameter, as in `fetchHackerNews`: the tool's budget and the Settings
 *  probe's are each their caller's to set. */
export async function searchWeb(
  apiKey: string,
  params: SearchParams,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildSearchBody(params)),
    signal,
  });
  if (!res.ok) throw await failure('/search', res);

  const body = (await res.json()) as { results?: TavilyHit[] };
  const hits = Array.isArray(body.results) ? body.results : [];
  return hits
    .filter((hit): hit is TavilyHit & { url: string } => Boolean(hit.url && hit.title))
    .map((hit) => ({
      title: hit.title ?? '',
      url: hit.url,
      content: hit.content ?? '',
      publishedDate: hit.published_date ?? '',
    }));
}

export interface TavilyKeyStatus {
  latencyMs: number;
  /** null when Tavily reported no figure — the key still works, we just cannot say how much
   *  of it is left, and inventing a 0 would read as "exhausted". */
  used: number | null;
  limit: number | null;
}

/**
 * What the Settings Test button runs: `GET /usage` rather than a throwaway search.
 *
 * A search would work as a probe and cost a credit every time someone pressed Test. This
 * validates the same key against the same auth layer for nothing, and returns the one number
 * that matters for a tool the *model* decides to spend credits on — a chat turn can search on
 * each of its eight iterations, so "how much is left" belongs on screen rather than in a
 * dashboard the user has to go and find.
 *
 * The tradeoff, stated because it is real: this proves the key is accepted, not that `/search`
 * answers. No failure has ever been observed that separates the two, and every 401/432/433 the
 * search path can raise is raised here identically.
 */
export async function checkTavilyKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<TavilyKeyStatus> {
  const started = Date.now();
  const res = await fetch(USAGE_URL, {
    method: 'GET',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) throw await failure('/usage', res);

  const body = (await res.json()) as { key?: { usage?: number; limit?: number } };
  return {
    latencyMs,
    used: typeof body.key?.usage === 'number' ? body.key.usage : null,
    limit: typeof body.key?.limit === 'number' ? body.key.limit : null,
  };
}
