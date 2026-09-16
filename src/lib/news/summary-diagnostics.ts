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

  if (/abort|timed out|timeout|signal timed out/i.test(error)) {
    return {
      summary: 'Ollama did not reply in 60s',
      hint: `A model loading into memory for the first time can take longer than this. Try "${model}" again once it is warm.`,
      detail: error,
      context,
    };
  }

  if (/failed to fetch|networkerror|load failed/i.test(error)) {
    return {
      summary: 'Ollama is unreachable',
      hint: `Nothing answered at ${baseUrl}. Check that "ollama serve" is running, then press Try again.`,
      detail: error,
      context,
    };
  }

  if (/invalid json|no usable summary|empty response/i.test(error)) {
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
