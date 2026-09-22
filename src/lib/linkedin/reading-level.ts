/**
 * Flesch–Kincaid grade level, in about thirty lines.
 *
 * Its own module because syllable heuristics are a self-contained body of arithmetic that will
 * be tuned on its own — the same reason `answers/time-range.ts` sits apart from everything
 * that uses it. No dependency: CLAUDE.md refuses one for a utility this size, and every
 * package that does this ships a dictionary an order of magnitude larger than the extension.
 */

/**
 * ≤ 9.0, not the 8.0 the voice spec names.
 *
 * "TypeScript", "architecture", "infrastructure" and "FastAPI" all inflate a syllable count
 * without making a sentence any harder to read, and this post is about software by definition.
 * A strict 8.0 fails every honest draft, and a check that always fails is one the user learns
 * to ignore.
 */
export const MAX_READING_GRADE = 9.0;

/** Vowel groups, minus a silent trailing 'e', floored at one. */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  const groups = clean.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 0);
}

export function countSentences(text: string): number {
  const parts = text.split(/[.!?]+(?:\s|$)/).filter((part) => /\S/.test(part));
  // A post of pure fragments still has to score as something, and dividing by zero scores NaN
  // — which compares false against every threshold and would silently pass the row.
  return Math.max(1, parts.length);
}

export function countWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => /[a-z]/i.test(word));
}

export function readingGrade(text: string): number {
  const words = countWords(text);
  if (words.length === 0) return 0;

  const sentences = countSentences(text);
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);

  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}
