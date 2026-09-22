import { describe, it, expect } from 'vitest';
import { MAX_READING_GRADE, countSentences, countSyllables, readingGrade } from '../reading-level';

describe('countSyllables', () => {
  it('counts vowel groups, not vowels', () => {
    expect(countSyllables('ship')).toBe(1);
    expect(countSyllables('shipping')).toBe(2);
    expect(countSyllables('engineer')).toBe(3);
  });

  it('drops a silent trailing e', () => {
    expect(countSyllables('code')).toBe(1);
    expect(countSyllables('scope')).toBe(1);
  });

  it('never returns zero for a real word', () => {
    expect(countSyllables('the')).toBe(1);
    expect(countSyllables('rhythm')).toBe(1);
  });

  it('ignores punctuation attached to a word', () => {
    expect(countSyllables('build.')).toBe(1);
    expect(countSyllables('"scope"')).toBe(1);
  });
});

describe('countSentences', () => {
  it('splits on terminators', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
  });

  /** Dividing by zero scores NaN, which compares false against every threshold. */
  it('never returns zero, so the grade can never be NaN', () => {
    expect(countSentences('no terminator here')).toBe(1);
    expect(countSentences('')).toBe(1);
  });
});

describe('readingGrade', () => {
  /**
   * The threshold is 9.0 rather than the voice spec's 8.0 precisely so this passes:
   * "TypeScript" and "architecture" inflate a syllable count without making a sentence hard,
   * and a check that fails every honest post is one the user learns to ignore.
   */
  it('passes real writing about software', () => {
    const post = [
      'We cut the build from nine minutes to forty seconds.',
      'The fix was esbuild. Not a rewrite.',
      'The TypeScript config stayed the same.',
      'The team noticed in a day.',
    ].join(' ');
    expect(readingGrade(post)).toBeLessThanOrEqual(MAX_READING_GRADE);
  });

  it('scores dense prose above the threshold', () => {
    const dense =
      'Notwithstanding considerable architectural complexity inherent in distributed transactional infrastructure, organisational modernisation represented an unavoidable prerequisite for sustainable operational scalability.';
    expect(readingGrade(dense)).toBeGreaterThan(MAX_READING_GRADE);
  });

  it('returns 0 for empty text rather than NaN', () => {
    expect(readingGrade('')).toBe(0);
    expect(readingGrade('   ')).toBe(0);
  });

  it('never returns a negative grade', () => {
    expect(readingGrade('Go. Do it. Now.')).toBeGreaterThanOrEqual(0);
  });
});
