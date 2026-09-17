import { extractOllamaError } from './ollama';

/**
 * The embeddings client — a sibling of `ollama.ts`, not a section inside it.
 *
 * `ollama.ts` is the chat and structured-generation client and is already long; embedding is a
 * different endpoint, a different failure set and a different model entirely (an embed-only
 * model cannot answer `/api/chat` at all, which is why `testModel` cannot verify one).
 */

export interface EmbedConfig {
  baseUrl: string;
  model: string;
}

/**
 * Longer than the chat test's 30s and the summarizer's 60s: this is one request carrying the
 * whole profile, and a cold embed model loading into VRAM behind it.
 */
export const EMBED_TIMEOUT_MS = 120_000;

type EmbedBatchResponse = { embeddings?: unknown };
type EmbedSingleResponse = { embedding?: unknown };

function isVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === 'number');
}

/**
 * Rejects a reply that is the wrong shape rather than letting it into the index.
 *
 * A short row, a missing row or a row of nulls all produce an index that scores every query
 * as equally relevant, which looks like a bad model rather than a bad response — and by then
 * the vectors are in storage and the failure has outlived the request that caused it.
 */
function validate(rows: unknown, expected: number): number[][] {
  if (!Array.isArray(rows) || rows.length !== expected) {
    return fail(`expected ${expected} embeddings, got ${Array.isArray(rows) ? rows.length : 0}`);
  }
  const vectors: number[][] = [];
  for (const row of rows) {
    if (!isVector(row)) return fail('a returned embedding was not a list of numbers');
    vectors.push(row);
  }
  const dim = vectors[0].length;
  if (vectors.some((v) => v.length !== dim)) return fail('returned embeddings had differing sizes');
  return vectors;
}

function fail(reason: string): never {
  throw new Error(`Ollama returned an unusable embedding response: ${reason}`);
}

async function post(url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * One vector per input, in the same order.
 *
 * Tries `/api/embed` (Ollama 0.3+, batched) and falls back to the older singular
 * `/api/embeddings` on a 404 — that endpoint takes one `prompt` and returns one `embedding`,
 * so the fallback is a serial loop. Worth keeping: the version that added `/api/embed` is
 * recent enough that a working install can predate it, and the failure is otherwise a bare
 * 404 the user has no way to read.
 */
export async function embedTexts(
  config: EmbedConfig,
  inputs: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const abort = signal ?? AbortSignal.timeout(EMBED_TIMEOUT_MS);

  const res = await post(
    `${config.baseUrl}/api/embed`,
    { model: config.model, input: inputs },
    abort,
  );

  if (res.status === 404) return embedOneByOne(config, inputs, abort);

  if (!res.ok) {
    const detail = extractOllamaError(await res.text().catch(() => ''));
    throw new Error(`Ollama /api/embed returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const data = (await res.json()) as EmbedBatchResponse;
  return validate(data.embeddings, inputs.length);
}

async function embedOneByOne(
  config: EmbedConfig,
  inputs: string[],
  signal: AbortSignal,
): Promise<number[][]> {
  const rows: unknown[] = [];
  for (const input of inputs) {
    const res = await post(
      `${config.baseUrl}/api/embeddings`,
      { model: config.model, prompt: input },
      signal,
    );
    if (!res.ok) {
      const detail = extractOllamaError(await res.text().catch(() => ''));
      throw new Error(
        `Ollama /api/embeddings returned ${res.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    const data = (await res.json()) as EmbedSingleResponse;
    rows.push(data.embedding);
  }
  return validate(rows, inputs.length);
}

/**
 * One tiny embedding, for the Test button. Deliberately not `testModel()`: that one POSTs
 * `/api/chat`, which an embed-only model such as `nomic-embed-text` rejects outright — so
 * testing an embed model with it reports "not installed" for a model that is installed and
 * working.
 */
export async function testEmbedModel(config: EmbedConfig, signal?: AbortSignal): Promise<number> {
  const started = Date.now();
  await embedTexts(config, ['ping'], signal ?? AbortSignal.timeout(EMBED_TIMEOUT_MS));
  return Date.now() - started;
}
