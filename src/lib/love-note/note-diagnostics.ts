/**
 * Turns a failed love-note run into something the user can act on.
 *
 * Its own module rather than a sixth `PostStage` in `linkedin/post-diagnostics.ts`, by the
 * test `search-diagnostics.ts` states: that module's stage table, its retry-button table and
 * two of its arms are the LinkedIn composer's, and extending it would make `lib/love-note/`
 * import LinkedIn's state machine to word an Ollama error. No `stage` field either — there
 * is one round trip, so there is nothing to tell apart.
 */

export type NoteFailureCause =
  | 'no-messages'
  | 'stale-worker'
  | 'timeout'
  | 'unreachable'
  | 'origin-blocked'
  | 'model-missing'
  | 'truncated'
  | 'bad-json'
  | 'empty'
  | 'server-error'
  | 'unknown';

export interface NoteDiagnosis {
  cause: NoteFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. Always names the one button `note-status.ts` puts on screen. */
  hint: string;
  /** The original error, never discarded. */
  detail: string;
  /** What was attempted, so the user can see where it broke. */
  context: string;
}

/**
 * The button the header shows in every state a failure can be seen in. Every hint below
 * interpolates it rather than naming a verb inline — `capture-diagnostics.ts`'s discipline:
 * a hint is only true while a button by that name is on screen.
 */
const RETRY_BUTTON = 'Write messages';

export function diagnoseNoteFailure(error: string, model: string, baseUrl: string): NoteDiagnosis {
  const detail = error;
  const context = `writing the messages · POST ${baseUrl}/api/generate · model "${model}"`;
  const base = { detail, context };

  // Only the first line is matched, never the whole string. Everything after it is verbatim
  // model output (see `structured-reply.ts`) — and here that output is a message to someone,
  // which can say anything at all. "Failed to fetch" is not something the user would type
  // to their girlfriend, but "no puedo" and "timed out" are both one sentence away.
  const causeLine = error.split('\n')[0] ?? '';

  // The feature arm first, because it is a guard firing as designed rather than a bug —
  // `draft-diagnostics.ts` puts `ungrounded` first for exactly this reason.
  if (/no usable messages/i.test(causeLine)) {
    return {
      ...base,
      cause: 'no-messages',
      summary: 'No usable messages came back',
      hint: `"${model}" answered, but nothing in the reply was a message, so none were shown. Press ${RETRY_BUTTON}. If it keeps happening, a larger model follows the format more reliably.`,
    };
  }

  // The one diagnosis whose next step is outside the panel. Chrome keeps the registered
  // service worker until the extension is reloaded while the panel's files are read fresh on
  // every open, so after a rebuild the panel can know this playbook and the worker not.
  if (/unknown message type/i.test(causeLine)) {
    return {
      ...base,
      cause: 'stale-worker',
      summary: 'The extension needs a reload',
      hint: `The service worker is running an older build that does not know this playbook. Reload Fillix at chrome://extensions, reopen the panel, then press ${RETRY_BUTTON}.`,
    };
  }

  if (/abort|timed out|timeout/i.test(causeLine)) {
    return {
      ...base,
      cause: 'timeout',
      summary: 'Nothing came back in time',
      hint: `"${model}" did not finish. A cold model loading into memory can take this long — press ${RETRY_BUTTON} once it is warm, or pick a smaller model in the Workflows header.`,
    };
  }

  // Before every status arm: a missing host permission produces a bare "Failed to fetch" with
  // no status at all, which on a first install is the likeliest failure of the lot.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(causeLine)) {
    return {
      ...base,
      cause: 'unreachable',
      summary: "Can't reach Ollama",
      hint: `Nothing answered. Check that "ollama serve" is running, then press ${RETRY_BUTTON}.`,
    };
  }

  if (/returned 403/.test(causeLine)) {
    return {
      ...base,
      cause: 'origin-blocked',
      summary: 'Ollama refused the extension',
      hint: `Set OLLAMA_ORIGINS=chrome-extension://* in the environment Ollama runs under, restart it, then press ${RETRY_BUTTON}.`,
    };
  }

  if (/returned 404/.test(causeLine) || /not found/i.test(causeLine)) {
    return {
      ...base,
      cause: 'model-missing',
      summary: 'Model not installed',
      hint: `Run "ollama pull ${model}", or check the name in Settings against "ollama list" — then press ${RETRY_BUTTON}.`,
    };
  }

  // Before the bad-json arm, and that order is the point: a cut-off reply is also unparseable,
  // so the arm below would otherwise claim it. They need different next steps.
  if (/cut off before it finished/i.test(causeLine)) {
    return {
      ...base,
      cause: 'truncated',
      summary: 'The reply was cut off before it finished',
      hint: `"${model}" was still writing when it ran out of room, so the half-written reply was discarded rather than shown. Press ${RETRY_BUTTON} — it usually lands the second time.`,
    };
  }

  if (/invalid JSON/i.test(causeLine)) {
    return {
      ...base,
      cause: 'bad-json',
      summary: 'The model did not answer in the required format',
      hint: `"${model}" finished, but not as the JSON this reads. Press ${RETRY_BUTTON}. If every attempt does it, another model in the Workflows header will do better.`,
    };
  }

  if (/empty response/i.test(causeLine)) {
    return {
      ...base,
      cause: 'empty',
      summary: 'The model returned nothing',
      hint: `"${model}" produced an empty response. Press ${RETRY_BUTTON}.`,
    };
  }

  // No catch-all 4xx arm, deliberately: a status we have not seen falls to `unknown` and shows
  // its own detail, where a generic arm would confidently report the wrong cause.
  if (/returned 5\d\d/.test(causeLine)) {
    return {
      ...base,
      cause: 'server-error',
      summary: 'Ollama returned an error',
      hint: `The request was accepted and then failed. Press ${RETRY_BUTTON}.`,
    };
  }

  return {
    ...base,
    cause: 'unknown',
    summary: "Couldn't write the messages",
    hint: `Press ${RETRY_BUTTON} to try again.`,
  };
}
