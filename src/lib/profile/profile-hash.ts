/** Separates the model name from the document so "a\0b" and "ab" cannot collide by hand. */
const SEPARATOR = String.fromCharCode(0);

/**
 * Whether the stored index still belongs to the stored document.
 *
 * FNV-1a 32-bit, not `crypto.subtle`: the digest APIs are async, and making every staleness
 * check a promise would push `await` into the store, the tab's derived state and the label
 * that reads "Profile changed since last index". This is not a security boundary — the worst
 * a collision costs is one stale index, and the character count stored beside it catches the
 * edits a 32-bit hash is most likely to miss.
 *
 * The embed model is part of the input on purpose: vectors from a different model are not
 * comparable to each other, so changing it has to invalidate the index exactly as an edit does.
 */
export function hashProfile(markdown: string, embedModel: string): string {
  const input = `${embedModel}${SEPARATOR}${markdown}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // The FNV prime, via shifts: a plain `hash * 16777619` exceeds 2^53 and silently loses
    // the low bits that carry most of the entropy.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
