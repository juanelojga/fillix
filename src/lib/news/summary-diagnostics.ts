/**
 * Turns a failed summary into something the user can act on.
 *
 * Two very different failures arrive as opaque strings: the article fetch being
 * blocked by the site, and Ollama not answering. They need different next steps, so
 * the stage is carried explicitly rather than guessed from the message.
 */

export type SummaryStage = 'fetch' | 'summarize';

export interface SummaryDiagnosis {
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. */
  hint: string;
  /** The original error, never discarded or prettified. */
  detail: string;
  /** What was attempted, so the user can see where it broke. */
  context: string;
}

export function diagnoseSummaryFailure(
  stage: SummaryStage,
  error: string,
  url: string,
  baseUrl: string,
  model: string,
): SummaryDiagnosis {
  if (stage === 'fetch') {
    return {
      summary: "Couldn't read the article",
      hint: 'The site blocked the extension or returned no readable text. Open the article to read it directly, or press Try again.',
      detail: error,
      context: `GET ${url}`,
    };
  }

  const context = `POST ${baseUrl}/api/generate · model "${model}"`;

  // First line only, for the reason `answers/draft-diagnostics.ts` states at length: everything
  // after it is verbatim model output, and the timeout arm below is checked before the JSON ones.
  const causeLine = error.split('\n')[0] ?? '';

  if (/abort|timed out|timeout|signal timed out/i.test(causeLine)) {
    return {
      summary: 'Ollama did not reply in 60s',
      hint: `A model loading into memory for the first time can take longer than this. Try "${model}" again once it is warm.`,
      detail: error,
      context,
    };
  }

  if (/failed to fetch|networkerror|load failed/i.test(causeLine)) {
    return {
      summary: 'Ollama is unreachable',
      hint: `Nothing answered at ${baseUrl}. Check that "ollama serve" is running, then press Try again.`,
      detail: error,
      context,
    };
  }

  // Above the arm below, which would otherwise claim it: a cut-off reply is unparseable too, but
  // "not in the expected JSON shape" is the wrong thing to tell someone whose model simply ran out
  // of room. `lib/structured-reply.ts` words the error this matches.
  if (/cut off before it finished/i.test(causeLine)) {
    return {
      summary: 'The summary was cut off',
      hint: `"${model}" ran out of room before it finished, so the half-written summary was discarded rather than shown. Press Try again.`,
      detail: error,
      context,
    };
  }

  if (/invalid json|no usable summary|empty response/i.test(causeLine)) {
    return {
      summary: 'The model returned nothing usable',
      hint: `"${model}" answered but not in the expected JSON shape. A larger model usually fixes this — smaller ones often ignore the format instruction.`,
      detail: error,
      context,
    };
  }

  return {
    summary: 'Summary failed',
    hint: 'The article was fetched, but Ollama did not return a summary. Check the model in Settings — the Test button there says whether it is reachable.',
    detail: error,
    context,
  };
}
