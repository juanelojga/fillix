/**
 * Why a question could not be answered from the profile.
 *
 * Same contract as `capture-diagnostics.ts`: a short worded line and the concrete next step.
 * There is no `detail` arm for the states — three of these four are *configuration*, not
 * errors, and there is no raw string to keep. The fourth carries Ollama's own, and that one
 * is handed to `embed-diagnostics.ts`, which already knows how to read it.
 */

export type RetrievalFailure =
  | { reason: 'no-embed-model' }
  | { reason: 'no-index' }
  | { reason: 'stale-index' }
  | { reason: 'empty-profile' }
  | { reason: 'embed-failed'; error: string };

export interface RetrievalDiagnosis {
  /** One short line naming the cause. */
  summary: string;
  /** The next step to take. */
  hint: string;
}

/**
 * Every hint names the Profile tab, because that is where all four are fixed — and, unlike the
 * capture hints, the button that fixes them is not on screen when the message appears.
 */
export function diagnoseRetrievalFailure(failure: RetrievalFailure): RetrievalDiagnosis {
  switch (failure.reason) {
    case 'no-embed-model':
      return {
        summary: 'No embedding model chosen',
        hint: 'Open the Profile tab, name an embedding model such as nomic-embed-text, press Test, then Build index.',
      };

    case 'empty-profile':
      return {
        summary: 'Your profile is empty',
        hint: 'Answers are written from your own CV and nothing else. Open the Profile tab and write it first.',
      };

    case 'no-index':
      return {
        summary: 'Your profile has not been indexed',
        hint: 'Open the Profile tab and press Build index. It runs once and takes about a minute.',
      };

    // Deliberately not "just use the old index": vectors that no longer describe the document
    // rank the wrong sections, and an answer citing a heading the profile no longer contains
    // is worse than no answer.
    case 'stale-index':
      return {
        summary: 'Your profile changed since it was indexed',
        hint: 'Open the Profile tab and press Build index, so answers are drawn from what you actually wrote.',
      };

    case 'embed-failed':
      return {
        summary: "Couldn't search your profile",
        hint: 'Ollama could not embed the question. The Profile tab has the details — press Test next to your embedding model.',
      };
  }
}
