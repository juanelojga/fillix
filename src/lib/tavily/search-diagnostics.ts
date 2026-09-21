/**
 * Turns a failed Tavily call into something the user can act on, the same contract as
 * `model-test-diagnostics.ts` and `news/summary-diagnostics.ts`.
 *
 * Its own module rather than an arm of either, by the test `profile/embed-diagnostics.ts` states:
 * the causes are unique to this path and the existing wording would be actively misleading. A 401
 * here is a key that was mistyped or rotated, and `diagnoseTestFailure` has no arm for one at all;
 * its 404 arm would tell someone to run `ollama pull`. This is also the first place in the codebase
 * that has any vocabulary for an unauthorized request, a rate limit or a spent quota.
 *
 * Read by two callers. The Settings badge renders all four fields; `tools/tavily-search.ts` returns
 * only `summary` and `hint`, which are strings we authored — so Tavily's own message never reaches
 * the conversation and cannot carry the key into chat history.
 */

export type TavilyFailureCause =
  | 'no-key'
  | 'timeout'
  | 'unreachable'
  | 'bad-key'
  | 'rate-limited'
  | 'plan-limit'
  | 'paygo-limit'
  | 'bad-request'
  | 'server-error'
  | 'unknown';

export interface TavilyDiagnosis {
  cause: TavilyFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. Empty when we have nothing better than the raw error. */
  hint: string;
  /** The original error, never discarded or prettified. */
  detail: string;
  /** What was attempted, so the user can see where it broke. */
  context: string;
}

export type TavilyEndpoint = '/search' | '/usage';

export function diagnoseTavilyFailure(error: string, endpoint: TavilyEndpoint): TavilyDiagnosis {
  const context =
    endpoint === '/usage'
      ? 'GET https://api.tavily.com/usage'
      : 'POST https://api.tavily.com/search';
  const base = { detail: error, context };

  if (/no tavily api key/i.test(error)) {
    return {
      ...base,
      cause: 'no-key',
      summary: 'No API key saved',
      // Worded for both readers. This arm renders in the Settings badge *and* inside a chat reply,
      // where the model relays it to the user — so "above" or "press Save key" would be advice
      // about a control that is not on screen.
      hint: 'Paste a Tavily key in the extension Settings tab to turn web search on. Until then the model is not told the search tool exists.',
    };
  }

  // Before the network arm, for the reason `model-test-diagnostics.ts` gives: an aborted fetch
  // also reads as a failure to fetch.
  if (/abort|timed out|timeout/i.test(error)) {
    return {
      ...base,
      cause: 'timeout',
      summary: 'No reply from Tavily in 15s',
      hint: 'The request was still in flight when it was cut off. Try again; if it keeps timing out, something on this network may be blocking api.tavily.com.',
    };
  }

  // Before every status arm: a missing host_permissions entry produces a bare "Failed to fetch"
  // with no status at all, and on a first install that is the likeliest failure of the lot.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(error)) {
    return {
      ...base,
      cause: 'unreachable',
      summary: "Can't reach Tavily",
      hint: 'Nothing answered at api.tavily.com. Check the connection — and check that "https://api.tavily.com/*" is still in host_permissions in manifest.config.ts, because a missing entry fails exactly like an offline network and needs an extension reload.',
    };
  }

  if (/returned 40[13]/.test(error)) {
    return {
      ...base,
      cause: 'bad-key',
      summary: 'Tavily rejected the key',
      hint: 'Copy the key from your Tavily dashboard and paste it again — it starts with "tvly-". A key that was rotated or revoked reads exactly like a typo.',
    };
  }

  if (/returned 429/.test(error)) {
    const retry = /retry after (\d+)s/i.exec(error);
    return {
      ...base,
      cause: 'rate-limited',
      summary: 'Too many requests',
      hint: retry
        ? `Tavily is throttling this key and asked for a ${retry[1]}-second pause. Wait that long, then try again.`
        : 'Tavily is throttling this key. Wait a few seconds, then try again.',
    };
  }

  if (/returned 432/.test(error)) {
    return {
      ...base,
      cause: 'plan-limit',
      summary: 'Tavily credits used up',
      hint: "This key has spent its plan's credits. They reset with the billing period, or you can raise the plan in the Tavily dashboard. Only web search is affected — nothing else in Fillix uses this key.",
    };
  }

  if (/returned 433/.test(error)) {
    return {
      ...base,
      cause: 'paygo-limit',
      summary: 'Pay-as-you-go limit reached',
      hint: 'The spend cap on this key has been hit. Raise it in the Tavily dashboard, or wait for the period to reset.',
    };
  }

  if (/returned 4(00|22)/.test(error)) {
    return {
      ...base,
      cause: 'bad-request',
      summary: 'Tavily refused the request',
      hint: 'The key is fine — the request was not. That is a bug in what Fillix sent rather than something to fix here; the detail below names the field.',
    };
  }

  if (/returned 5\d\d/.test(error)) {
    return {
      ...base,
      cause: 'server-error',
      summary: 'Tavily returned an error',
      hint: 'Tavily accepted the request and failed to answer it. Try again in a minute.',
    };
  }

  // Deliberately no generic `/returned 4\d\d/` arm above. A status Tavily adds later falls to here
  // and shows its own detail, which is honest; a catch-all 4xx arm would confidently tell someone
  // their key was bad when it was not.
  return { ...base, cause: 'unknown', summary: 'Search failed', hint: '' };
}
