import { PILLAR_QUERY_TERMS, type PillarId } from './post-taxonomy';

/**
 * The text whose embedding finds the author's own specifics for a topic.
 *
 * Its own module, like `answers/answer-query.ts`: this is reworded whenever a small embedding
 * model retrieves the wrong sections, while `post-specifics.ts` changes when the refusal shape
 * does. Two reasons to change, two files.
 */

/**
 * Not the topic alone.
 *
 * "Most architecture diagrams are wish-lists disguised as plans" names no technology at all,
 * so on its own it retrieves whichever profile section reads most like an opinion. The
 * pillar's vocabulary puts the words the CV actually uses into the vector — the same argument
 * `buildRetrievalQuery` makes about a job's required skills.
 */
export function buildSpecificsQuery(topic: string, angle: string, pillar: PillarId): string {
  const terms = PILLAR_QUERY_TERMS[pillar] ?? [];
  return [topic.trim(), angle.trim(), terms.join(', ')].filter(Boolean).join('\n\n');
}
