import { embedTexts } from '../ollama-embed';
import type { ProfileIndex } from '../storage';
import { chunkProfile } from './chunk';
import { hashProfile } from './profile-hash';

/**
 * Builds the profile's vector index.
 *
 * Worker-only by construction: building an index is an outbound HTTP request, and the worker
 * is the only context allowed to make one. Judging an index stale is a different concern with
 * a different caller and lives in `index-staleness.ts`, so the panel can ask that question
 * without importing an HTTP client to answer it.
 */

/**
 * Six decimals. Cosine similarity is unaffected at this precision — these vectors are already
 * unit-ish and the differences that decide a ranking are orders of magnitude larger — while
 * `JSON.stringify` of a raw float64 spends about 20 characters per number against this 9.
 * On a 40-chunk, 768-dimension index that is the difference between ~600 KB and ~275 KB of a
 * 10 MB quota shared with the news cache.
 */
const VECTOR_PRECISION = 1e6;

function round(vector: number[]): number[] {
  return vector.map((n) => Math.round(n * VECTOR_PRECISION) / VECTOR_PRECISION);
}

/** Nothing to index is not a failure, but it is also not an index. */
export class EmptyProfileError extends Error {
  constructor() {
    super('There is nothing to index yet — write your profile first.');
    this.name = 'EmptyProfileError';
  }
}

export async function buildProfileIndex(
  baseUrl: string,
  embedModel: string,
  markdown: string,
): Promise<ProfileIndex> {
  const chunks = chunkProfile(markdown);
  if (chunks.length === 0) throw new EmptyProfileError();

  const vectors = await embedTexts(
    { baseUrl, model: embedModel },
    chunks.map((c) => c.text),
  );

  // embedTexts already guarantees one row per input and a uniform width, so this is the
  // assembly step only — the validation it would otherwise duplicate lives there, next to the
  // response it is about.
  return {
    hash: hashProfile(markdown, embedModel),
    chars: markdown.length,
    model: embedModel,
    dim: vectors[0].length,
    builtAt: Date.now(),
    chunks: chunks.map((chunk, i) => ({ ...chunk, vector: round(vectors[i]) })),
  };
}
