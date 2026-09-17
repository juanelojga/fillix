/**
 * Turns a failed draft into something the user can act on.
 *
 * Same contract as `news/summary-diagnostics.ts`, and for the same reason: two very different
 * failures arrive as one opaque string — Ollama not answering, and Ollama answering with
 * something unusable — and they need different next steps.
 */

export type DraftFailureCause =
  | 'unreachable'
  | 'origin-blocked'
  | 'model-missing'
  | 'timeout'
  | 'ungrounded'
  | 'bad-json'
  | 'empty'
  | 'server-error'
  | 'unknown';

export interface DraftDiagnosis {
  cause: DraftFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. */
  hint: string;
  /** The original error, never discarded. */
  detail: string;
}

export function diagnoseDraftFailure(error: string, model: string): DraftDiagnosis {
  const detail = error;

  // First, because it is the one failure that is working as designed. The model wrote a
  // confident answer out of its own training rather than out of the profile, and the draft was
  // thrown away on purpose — the user should read that as the guard firing, not as a bug.
  if (/without citing your profile/i.test(error)) {
    return {
      cause: 'ungrounded',
      summary: 'The answer was not grounded in your profile',
      hint: `"${model}" wrote an answer without saying which sections it came from, so it was discarded rather than shown. Press Re-draft. If it keeps happening, a larger model follows this instruction more reliably.`,
      detail,
    };
  }

  if (/abort|timed out|timeout/i.test(error)) {
    return {
      cause: 'timeout',
      summary: 'No answer within 2 minutes',
      hint: `"${model}" did not finish. A cold model loading into memory can take this long — press Re-draft once it is warm, or pick a smaller model in Settings.`,
      detail,
    };
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(error)) {
    return {
      cause: 'unreachable',
      summary: "Can't reach Ollama",
      hint: 'Nothing answered. Check that "ollama serve" is running, then press Re-draft.',
      detail,
    };
  }

  if (/returned 403/.test(error)) {
    return {
      cause: 'origin-blocked',
      summary: 'Ollama refused the extension',
      hint: 'Set OLLAMA_ORIGINS=chrome-extension://* in the environment Ollama runs under, then restart it.',
      detail,
    };
  }

  if (/returned 404/.test(error) || /not found/i.test(error)) {
    return {
      cause: 'model-missing',
      summary: 'Model not installed',
      hint: `Run "ollama pull ${model}", or check the name in Settings against "ollama list".`,
      detail,
    };
  }

  if (/invalid JSON/i.test(error)) {
    return {
      cause: 'bad-json',
      summary: 'The model did not answer in the required format',
      hint: `"${model}" returned something that was not the expected JSON. Smaller models do this under a long prompt — press Re-draft, or try a larger one.`,
      detail,
    };
  }

  if (/empty response/i.test(error)) {
    return {
      cause: 'empty',
      summary: 'The model returned nothing',
      hint: `"${model}" produced an empty response. Press Re-draft.`,
      detail,
    };
  }

  if (/returned 5\d\d/.test(error)) {
    return {
      cause: 'server-error',
      summary: 'Ollama returned an error',
      hint: 'Ollama accepted the request but failed to answer it. Check the "ollama serve" logs.',
      detail,
    };
  }

  return {
    cause: 'unknown',
    summary: 'Drafting failed',
    hint: 'Press Re-draft to try again.',
    detail,
  };
}
