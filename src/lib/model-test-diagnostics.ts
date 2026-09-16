/**
 * Turns the raw error thrown by `testModel()` into something a user can act on.
 *
 * The four real causes of a failed model test — Ollama not running, the
 * extension origin being rejected, the model not being pulled, and a cold-load
 * timeout — all arrive as one opaque string. `ollama.ts` formats HTTP failures
 * as `Ollama /api/chat returned <status>: <ollama error field>`, so both the
 * status code and Ollama's own message are present and can be matched on.
 */

export type TestFailureCause =
  | 'unreachable'
  | 'origin-blocked'
  | 'model-missing'
  | 'timeout'
  | 'server-error'
  | 'unknown';

export type TestDiagnosis = {
  cause: TestFailureCause;
  /** One short line naming the likely cause. */
  summary: string;
  /** The next step to take. Empty when we have nothing better than the raw error. */
  hint: string;
  /** The original error, never discarded. */
  detail: string;
};

export function diagnoseTestFailure(error: string, baseUrl: string, model: string): TestDiagnosis {
  const detail = error;

  // Checked before the network case: an aborted fetch can also read as a failure to fetch.
  if (/abort|timed out|timeout/i.test(error)) {
    return {
      cause: 'timeout',
      summary: 'No reply within 30s',
      hint: `A large model loading into VRAM for the first time can take longer than this. Try "${model}" again once it is warm.`,
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

  if (/returned 404/.test(error) || /not found/i.test(error)) {
    return {
      cause: 'model-missing',
      summary: 'Model not installed',
      hint: `Run "ollama pull ${model}", or check the name against "ollama list" — the tag has to match exactly.`,
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

  return { cause: 'unknown', summary: 'Test failed', hint: '', detail };
}
