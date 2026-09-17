import type { ProfileIndex } from '../storage';

/**
 * Which profile sections a question should be answered from.
 *
 * Pure, like `news/interleave.ts`: no `chrome.*`, no network, no storage. The vectors live in
 * storage and the panel already has them, so the only thing that has to cross the port is the
 * one-line *query* — scoring ~40 chunks is arithmetic, and shipping a quarter-megabyte of
 * floats to the worker and back per question would be absurd.
 */

export interface RetrievedChunk {
  /** The `##` heading, which is what a drafted answer cites. */
  heading: string;
  /** The section text, heading line included. */
  text: string;
  /** Cosine similarity to the query, in [-1, 1]. Kept so the UI can show what was weak. */
  score: number;
}

/** Eight sections of ~1 200 characters is already most of a small model's usable context. */
export const DEFAULT_MAX_CHUNKS = 8;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  // A zero vector has no direction, so it has no similarity to anything. Returning 0 rather
  // than the NaN the division would give matters: NaN compares false against everything, so
  // one of them scatters the sort and takes real results down with it.
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * The best-matching sections, most relevant first, under a character budget.
 *
 * Returns nothing when the index was built by a different model than produced `queryVector`:
 * two embedding spaces have no relationship to each other, so the scores would be arithmetic
 * without meaning — confidently ranked noise, which is worse than an empty answer. Callers
 * decide *before* this whether the index is usable; see `index-staleness.ts`.
 */
export function topChunks(
  index: ProfileIndex,
  queryVector: number[],
  budgetChars: number,
  maxChunks: number = DEFAULT_MAX_CHUNKS,
): RetrievedChunk[] {
  if (queryVector.length === 0 || queryVector.length !== index.dim) return [];

  const scored = index.chunks
    .filter((chunk) => chunk.vector.length === queryVector.length)
    .map((chunk) => ({
      heading: chunk.heading,
      text: chunk.text,
      ordinal: chunk.ordinal,
      score: cosine(chunk.vector, queryVector),
    }))
    // Ties fall back to the order the author wrote them in, so a rebuild of the same profile
    // cannot silently reshuffle which section an answer cites.
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);

  const taken: RetrievedChunk[] = [];
  let used = 0;

  for (const chunk of scored) {
    if (taken.length >= maxChunks) break;
    // The first chunk is taken whatever it costs: one section over budget is still the best
    // evidence there is, and returning nothing would make the model answer from thin air.
    if (taken.length > 0 && used + chunk.text.length > budgetChars) continue;
    taken.push({ heading: chunk.heading, text: chunk.text, score: chunk.score });
    used += chunk.text.length;
  }

  return taken;
}
