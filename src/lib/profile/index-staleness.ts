import type { ProfileIndex } from '../storage';
import { hashProfile } from './profile-hash';

/**
 * Whether the stored index still describes the stored document.
 *
 * Its own module, apart from `profile-index.ts`, for two reasons that turn out to be the same
 * reason. It changes when the *comparison rules* change, while building an index changes when
 * the embedding call does. And it is asked in the side panel, on every keystroke, to decide
 * whether to show "Profile changed since last index" — while building runs only in the service
 * worker. Keeping them together made the panel import the embeddings client, and through it
 * the whole chat client, to perform three string comparisons.
 */
export function isIndexStale(
  index: ProfileIndex | null,
  markdown: string,
  embedModel: string,
): boolean {
  if (!index) return true;
  // Vectors from two different models share no space at all, so they are not comparable to
  // each other and a model change invalidates as surely as an edit does.
  if (index.model !== embedModel) return true;
  // Checked beside the hash because that hash is 32-bit: a collision is vanishingly unlikely
  // but free to rule out, and a length change is the commonest edit there is.
  if (index.chars !== markdown.length) return true;
  return index.hash !== hashProfile(markdown, embedModel);
}
