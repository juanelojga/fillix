/**
 * Turns a failed embedding into something the user can act on.
 *
 * Same contract as `model-test-diagnostics.ts`, and the same matching trick: `ollama-embed.ts`
 * formats HTTP failures as `Ollama /api/embed returned <status>: <ollama error field>`, so both
 * the status and Ollama's own message survive into one string.
 *
 * Two causes are unique to this path and are the reason it is not just `diagnoseTestFailure`:
 * naming a *chat* model as the embed model, and an Ollama old enough to have neither endpoint.
 */

export type EmbedFailureCause =
  | 'unreachable'
  | 'origin-blocked'
  | 'model-missing'
  | 'not-an-embed-model'
  | 'endpoint-missing'
  | 'bad-response'
  | 'timeout'
  | 'server-error'
  | 'unknown';

export interface EmbedDiagnosis {
  cause: EmbedFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. Empty when we have nothing better than the raw error. */
  hint: string;
  /** The original error, never discarded. */
  detail: string;
}

export function diagnoseEmbedFailure(
  error: string,
  baseUrl: string,
  model: string,
): EmbedDiagnosis {
  const detail = error;

  // Checked before the network case: an aborted fetch also reads as a failure to fetch.
  if (/abort|timed out|timeout/i.test(error)) {
    return {
      cause: 'timeout',
      summary: 'No reply within 2 minutes',
      hint: `An embedding model loading into memory for the first time can take this long. Try "${model}" again once it is warm, or index a shorter profile first.`,
      detail,
    };
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(error)) {
    return {
      cause: 'unreachable',
      summary: "Can't reach Ollama",
      hint: `Nothing answered at ${baseUrl}. Check that "ollama serve" is running. A base URL other than http://localhost:11434 also needs a matching host_permissions entry in manifest.config.ts and an extension reload.`,
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

  // Ollama's own wording when a chat model is asked to embed. Checked before the 404 case:
  // some versions report it as a 400 and some as a 404 with this message attached.
  if (/does not support (embed|generate embedding)|not an embedding model/i.test(error)) {
    return {
      cause: 'not-an-embed-model',
      summary: `"${model}" cannot produce embeddings`,
      hint: `A chat model and an embedding model are different things — a chat model has no embedding output to give. Run "ollama pull nomic-embed-text" and name that here instead.`,
      detail,
    };
  }

  if (/\/api\/embeddings returned 404/.test(error)) {
    return {
      cause: 'endpoint-missing',
      summary: 'This Ollama has no embeddings endpoint',
      hint: 'Neither /api/embed nor /api/embeddings answered. Upgrade Ollama — embeddings have been available since 0.1.x and batched since 0.3.',
      detail,
    };
  }

  if (/returned 404/.test(error) || /not found/i.test(error)) {
    return {
      cause: 'model-missing',
      summary: 'Embedding model not installed',
      hint: `Run "ollama pull ${model}", or check the name against "ollama list" — the tag has to match exactly.`,
      detail,
    };
  }

  // The client validated the shape and refused it, so the request succeeded and the payload
  // was wrong. That is a different next step from every HTTP failure above.
  if (/unusable embedding response/i.test(error)) {
    return {
      cause: 'bad-response',
      summary: 'Ollama returned embeddings we cannot use',
      hint: `The request succeeded but the vectors were the wrong shape, so nothing was saved. Check that "${model}" is an embedding model rather than a chat model with an embedding adapter.`,
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

  return { cause: 'unknown', summary: 'Indexing failed', hint: '', detail };
}
