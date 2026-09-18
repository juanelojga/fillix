import { isIndexStale } from './index-staleness';
import { topChunks, type RetrievedChunk } from './retrieve';
import type { RetrievalFailure } from './retrieval-diagnostics';
import type { ProfileIndex } from '../storage';

/**
 * Which profile sections should answer one question.
 *
 * Lifted out of `sidepanel/stores/profile.ts` so the panel and the eval harness score against
 * one implementation rather than two that agree until they don't. Only the embedding step is
 * impure, and it arrives as a parameter: the panel sends the query across the port to the
 * worker, the harness calls `/api/embed` directly, and everything either side of that is the
 * same function.
 */

export type RetrievalResult =
  | { ok: true; chunks: RetrievedChunk[] }
  | ({ ok: false } & RetrievalFailure);

/** One query in, one vector out. The port in the panel; a direct embed call in the eval. */
export type QueryEmbedder = (
  query: string,
) => Promise<{ ok: true; vector: number[] } | { ok: false; error: string }>;

/** The three stored values the refusals are decided from. */
export interface RetrievalInputs {
  embedModel: string;
  markdown: string;
  index: ProfileIndex | null;
}

/**
 * Refuses *before* embedding anything whenever the index cannot be trusted, so the caller gets
 * a reason it can word rather than an empty list it has to guess at. That ordering is the
 * point: `topChunks` returns nothing for an unusable index too, and a silent empty result is
 * indistinguishable from "your CV says nothing about this", which is a very different thing to
 * tell someone applying for a job.
 *
 * Staleness is recomputed here with `isIndexStale` rather than read off the panel's derived
 * store — the same function over the same three values, so the verdict cannot differ, and the
 * store keeps its copy only because the Profile tab prints it as a label.
 */
export async function retrieveFromIndex(
  inputs: RetrievalInputs,
  query: string,
  budgetChars: number,
  embed: QueryEmbedder,
): Promise<RetrievalResult> {
  if (!inputs.embedModel.trim()) return { ok: false, reason: 'no-embed-model' };
  if (!inputs.markdown.trim()) return { ok: false, reason: 'empty-profile' };

  const index = inputs.index;
  if (!index) return { ok: false, reason: 'no-index' };
  if (isIndexStale(index, inputs.markdown, inputs.embedModel)) {
    return { ok: false, reason: 'stale-index' };
  }

  const embedded = await embed(query);
  if (!embedded.ok) return { ok: false, reason: 'embed-failed', error: embedded.error };

  return { ok: true, chunks: topChunks(index, embedded.vector, budgetChars) };
}
