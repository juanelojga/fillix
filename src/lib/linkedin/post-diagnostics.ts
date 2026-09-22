/**
 * Turns a failed composer stage into something the user can act on.
 *
 * One module with a `stage` parameter rather than one module per stage, by the test
 * `search-diagnostics.ts` states: a module earns its own file when its causes are unique and
 * the existing wording would actively mislead. Four of the five stages here fail through the
 * same `generateStructured` and share every arm — only the button to press and the thing that
 * was being attempted differ, and both are parameters.
 *
 * `stage` is passed in, never inferred from the message. `summary-diagnostics.ts` makes the
 * same choice for the same reason: the caller knows which round trip it was on, and guessing
 * from the error text is how a research failure comes to be reported as a drafting one.
 */

import type { PostStage } from './composer-stage';

export type PostFailureCause =
  | 'no-topics'
  | 'bad-brief'
  | 'timeout'
  | 'unreachable'
  | 'origin-blocked'
  | 'model-missing'
  | 'truncated'
  | 'bad-json'
  | 'empty'
  | 'server-error'
  | 'unknown';

export interface PostDiagnosis {
  stage: PostStage;
  cause: PostFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. Always names a button that is on screen at this stage. */
  hint: string;
  /** The original error, never discarded. */
  detail: string;
  /** What was attempted, so the user can see where it broke. */
  context: string;
}

/**
 * The button each stage actually shows. Every hint below interpolates one of these rather
 * than naming a verb inline, which is what keeps `capture-diagnostics.ts`'s discipline —
 * a hint is only true while a button by that name is on screen.
 */
const RETRY_BUTTON: Record<PostStage, string> = {
  topics: 'Suggest topics',
  research: 'Regenerate',
  brief: 'Regenerate',
  draft: 'Regenerate',
  audit: 'Regenerate',
};

const ATTEMPTED: Record<PostStage, string> = {
  topics: 'suggesting topics',
  research: 'searching the web and Hacker News',
  brief: 'writing the angle brief',
  draft: 'writing the post',
  audit: 'reviewing the post',
};

export function diagnosePostFailure(
  stage: PostStage,
  error: string,
  model: string,
  baseUrl: string,
): PostDiagnosis {
  const detail = error;
  const retry = RETRY_BUTTON[stage];

  // The research stage never reaches Ollama, so naming `/api/generate` there would send the
  // user to the wrong place entirely.
  const context =
    stage === 'research'
      ? `${ATTEMPTED[stage]} · api.tavily.com and hn.algolia.com`
      : `${ATTEMPTED[stage]} · POST ${baseUrl}/api/generate · model "${model}"`;

  const base = { stage, detail, context };

  // Only the first line is matched, never the whole string. Everything after it is verbatim
  // model output (see `structured-reply.ts`) — and here that output is a LinkedIn post, which
  // is prose about software. A post whose body reads "our checkout service had a request
  // timeout" must not be diagnosed as Ollama timing out.
  const causeLine = error.split('\n')[0] ?? '';

  // The two feature arms first, because both are guards firing as designed rather than bugs —
  // `draft-diagnostics.ts` puts `ungrounded` first for exactly this reason.
  if (/no usable topics/i.test(causeLine)) {
    return {
      ...base,
      cause: 'no-topics',
      summary: 'No usable topics came back',
      hint: `"${model}" answered, but not one suggestion named a pillar from the list it was given, so none were shown. Press ${retry}. If it keeps happening, a larger model follows the id list more reliably.`,
    };
  }

  if (/unusable angle brief/i.test(causeLine)) {
    return {
      ...base,
      cause: 'bad-brief',
      summary: "The angle brief didn't hold together",
      hint: `"${model}" returned a brief whose pillar, style, funnel stage or hooks did not pass validation, so it was discarded rather than shown. Press ${retry}.`,
    };
  }

  if (/abort|timed out|timeout/i.test(causeLine)) {
    return {
      ...base,
      cause: 'timeout',
      summary: 'Nothing came back in time',
      hint:
        stage === 'research'
          ? `The search did not finish within 15 seconds. Press ${retry} — the post can be written from Hacker News alone if the web stays unreachable.`
          : `"${model}" did not finish. A cold model loading into memory can take this long — press ${retry} once it is warm, or pick a smaller model in the Workflows header.`,
    };
  }

  // Before every status arm: a missing host permission produces a bare "Failed to fetch" with
  // no status at all, which on a first install is the likeliest failure of the lot.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(causeLine)) {
    return {
      ...base,
      cause: 'unreachable',
      summary: stage === 'research' ? "Can't reach the search services" : "Can't reach Ollama",
      hint:
        stage === 'research'
          ? `Nothing answered. Check your connection, then press ${retry}.`
          : `Nothing answered. Check that "ollama serve" is running, then press ${retry}.`,
    };
  }

  if (/returned 403/.test(causeLine)) {
    return {
      ...base,
      cause: 'origin-blocked',
      summary: 'Ollama refused the extension',
      hint: `Set OLLAMA_ORIGINS=chrome-extension://* in the environment Ollama runs under, restart it, then press ${retry}.`,
    };
  }

  if (/returned 404/.test(causeLine) || /not found/i.test(causeLine)) {
    return {
      ...base,
      cause: 'model-missing',
      summary: 'Model not installed',
      hint: `Run "ollama pull ${model}", or check the name in Settings against "ollama list" — then press ${retry}.`,
    };
  }

  // Before the bad-json arm, and that order is the point: a cut-off reply is also unparseable,
  // so the arm below would otherwise claim it. They need different next steps.
  if (/cut off before it finished/i.test(causeLine)) {
    return {
      ...base,
      cause: 'truncated',
      summary: 'The reply was cut off before it finished',
      hint: `"${model}" was still writing when it ran out of room, so the half-written reply was discarded rather than shown. Press ${retry} — it usually lands the second time.`,
    };
  }

  if (/invalid JSON/i.test(causeLine)) {
    return {
      ...base,
      cause: 'bad-json',
      summary: 'The model did not answer in the required format',
      hint: `"${model}" finished, but not as the JSON this reads. Press ${retry}. If every attempt does it, another model in the Workflows header will do better.`,
    };
  }

  if (/empty response/i.test(causeLine)) {
    return {
      ...base,
      cause: 'empty',
      summary: 'The model returned nothing',
      hint: `"${model}" produced an empty response. Press ${retry}.`,
    };
  }

  // No catch-all 4xx arm, deliberately: a status we have not seen falls to `unknown` and shows
  // its own detail, where a generic arm would confidently report the wrong cause.
  if (/returned 5\d\d/.test(causeLine)) {
    return {
      ...base,
      cause: 'server-error',
      summary:
        stage === 'research' ? 'A search service returned an error' : 'Ollama returned an error',
      hint: `The request was accepted and then failed. Press ${retry}.`,
    };
  }

  return {
    ...base,
    cause: 'unknown',
    summary: `Couldn't finish ${ATTEMPTED[stage]}`,
    hint: `Press ${retry} to try again.`,
  };
}
