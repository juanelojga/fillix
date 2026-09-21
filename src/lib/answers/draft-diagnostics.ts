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
  | 'truncated'
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

  // Only the first line is matched, never the whole string. Everything after it is verbatim model
  // output (see `lib/structured-reply.ts`), and the arms below are ordered with `timeout` and
  // `not found` ahead of the JSON ones — so an answer reading "I fixed a request timeout in the
  // checkout service" would otherwise be diagnosed as Ollama timing out. `detail` still carries
  // the whole error, so nothing is lost. Single-line errors are their own first line.
  const causeLine = error.split('\n')[0] ?? '';

  // First, because it is the one failure that is working as designed. The model wrote a
  // confident answer out of its own training rather than out of the profile, and the draft was
  // thrown away on purpose — the user should read that as the guard firing, not as a bug.
  if (/without citing your profile/i.test(causeLine)) {
    return {
      cause: 'ungrounded',
      summary: 'The answer was not grounded in your profile',
      hint: `"${model}" wrote an answer that neither names the sections it came from nor plainly says you have no experience with this, so it was discarded rather than shown. Press Re-draft. If it keeps happening, a larger model follows this instruction more reliably.`,
      detail,
    };
  }

  if (/abort|timed out|timeout/i.test(causeLine)) {
    return {
      cause: 'timeout',
      summary: 'No answer within 2 minutes',
      hint: `"${model}" did not finish. A cold model loading into memory can take this long — press Re-draft once it is warm, or pick a smaller model in Settings.`,
      detail,
    };
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(causeLine)) {
    return {
      cause: 'unreachable',
      summary: "Can't reach Ollama",
      hint: 'Nothing answered. Check that "ollama serve" is running, then press Re-draft.',
      detail,
    };
  }

  if (/returned 403/.test(causeLine)) {
    return {
      cause: 'origin-blocked',
      summary: 'Ollama refused the extension',
      hint: 'Set OLLAMA_ORIGINS=chrome-extension://* in the environment Ollama runs under, then restart it.',
      detail,
    };
  }

  if (/returned 404/.test(causeLine) || /not found/i.test(causeLine)) {
    return {
      cause: 'model-missing',
      summary: 'Model not installed',
      hint: `Run "ollama pull ${model}", or check the name in Settings against "ollama list".`,
      detail,
    };
  }

  // Before the bad-json arm, and that order is the point: a cut-off reply is also unparseable, so
  // the arm below would otherwise claim it. They need different next steps — this one is the model
  // running out of room mid-sentence, not the model ignoring the format instruction, and it happens
  // on large models too. `structured-reply.ts` is what words the error this matches.
  if (/cut off before it finished/i.test(causeLine)) {
    return {
      cause: 'truncated',
      summary: 'The answer was cut off before it finished',
      hint: `"${model}" was still writing when it ran out of room, so the half-written answer was discarded rather than shown. Press Re-draft — it usually lands the second time. If the same question keeps doing it, that is the one to write by hand.`,
      detail,
    };
  }

  // Only genuinely malformed output reaches here now that truncation is caught above, so the hint
  // no longer blames prompt length — that was the truncation case, and sending the user to Settings
  // for it was wrong.
  if (/invalid JSON/i.test(causeLine)) {
    return {
      cause: 'bad-json',
      summary: 'The model did not answer in the required format',
      hint: `"${model}" finished its answer, but not as the JSON this reads. Press Re-draft. If every question does it, the model is ignoring the format instruction and another one in Settings will do better.`,
      detail,
    };
  }

  if (/empty response/i.test(causeLine)) {
    return {
      cause: 'empty',
      summary: 'The model returned nothing',
      hint: `"${model}" produced an empty response. Press Re-draft.`,
      detail,
    };
  }

  if (/returned 5\d\d/.test(causeLine)) {
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
