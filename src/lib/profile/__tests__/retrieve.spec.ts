import { describe, it, expect } from 'vitest';
import { topChunks } from '../retrieve';
import type { IndexedChunk, ProfileIndex } from '../../storage';

function chunk(heading: string, vector: number[], ordinal: number, text?: string): IndexedChunk {
  return {
    id: `${heading.toLowerCase()}-0`,
    heading,
    ordinal,
    text: text ?? `## ${heading}\n\nBody of ${heading}.`,
    vector,
  };
}

function index(chunks: IndexedChunk[], dim = 2): ProfileIndex {
  return { hash: 'abc', chars: 100, model: 'nomic', dim, builtAt: 1, chunks };
}

const BIG = 10_000;

describe('topChunks', () => {
  const PYTHON = chunk('Python', [1, 0], 0);
  const REACT = chunk('React', [0, 1], 1);
  const BOTH = chunk('Full-stack', [0.7071, 0.7071], 2);

  it('ranks by similarity to the query, most relevant first', () => {
    const result = topChunks(index([REACT, BOTH, PYTHON]), [1, 0], BIG);

    expect(result.map((c) => c.heading)).toEqual(['Python', 'Full-stack', 'React']);
  });

  it('carries the heading and the full section text, since both are used', () => {
    const [top] = topChunks(index([PYTHON]), [1, 0], BIG);

    expect(top.heading).toBe('Python');
    expect(top.text).toBe('## Python\n\nBody of Python.');
    expect(top.score).toBeCloseTo(1);
  });

  // Magnitude must not decide the ranking: a long section is not a more relevant one, and a
  // raw dot product would make it one.
  it('scores by direction, not by magnitude', () => {
    const short = chunk('Short', [1, 0], 0);
    const long = chunk('Long', [10, 0], 1);

    const result = topChunks(index([short, long]), [1, 0], BIG);

    expect(result[0].score).toBeCloseTo(result[1].score);
  });

  // NaN compares false against everything, so one of them scatters the sort and takes the
  // real results down with it.
  it('scores a zero vector as zero rather than NaN', () => {
    const empty = chunk('Empty', [0, 0], 0);

    const [only] = topChunks(index([empty]), [1, 0], BIG);

    expect(only.score).toBe(0);
    expect(Number.isNaN(only.score)).toBe(false);
  });

  it('does not let a zero-vector chunk outrank a real match', () => {
    const empty = chunk('Empty', [0, 0], 0);

    const result = topChunks(index([empty, PYTHON]), [1, 0], BIG);

    expect(result[0].heading).toBe('Python');
  });

  // A rebuild of the same profile must not silently reshuffle which section an answer cites.
  it('breaks ties on the order the author wrote them in', () => {
    const b = chunk('B', [1, 0], 1);
    const a = chunk('A', [1, 0], 0);

    const result = topChunks(index([b, a]), [1, 0], BIG);

    expect(result.map((c) => c.heading)).toEqual(['A', 'B']);
  });

  describe('budgets', () => {
    const long = (heading: string, vector: number[], ordinal: number) =>
      chunk(heading, vector, ordinal, 'x'.repeat(100));

    it('stops taking chunks once the character budget is spent', () => {
      const chunks = [long('A', [1, 0], 0), long('B', [0.9, 0.1], 1), long('C', [0.8, 0.2], 2)];

      const result = topChunks(index(chunks), [1, 0], 250);

      expect(result.map((c) => c.heading)).toEqual(['A', 'B']);
    });

    // Returning nothing would make the model answer from thin air, which is the one outcome
    // the whole design exists to prevent.
    it('takes the best chunk even when it alone exceeds the budget', () => {
      const huge = chunk('Huge', [1, 0], 0, 'x'.repeat(5000));

      const result = topChunks(index([huge]), [1, 0], 10);

      expect(result.map((c) => c.heading)).toEqual(['Huge']);
    });

    // A later, smaller chunk still fits after a big one was skipped — skipping is per chunk,
    // not a stop, so the budget is actually used rather than abandoned.
    it('keeps filling the budget with smaller chunks after skipping a big one', () => {
      const chunks = [
        chunk('Best', [1, 0], 0, 'x'.repeat(50)),
        chunk('Big', [0.9, 0.1], 1, 'x'.repeat(500)),
        chunk('Small', [0.8, 0.2], 2, 'x'.repeat(20)),
      ];

      const result = topChunks(index(chunks), [1, 0], 100);

      expect(result.map((c) => c.heading)).toEqual(['Best', 'Small']);
    });

    it('never returns more than the chunk cap', () => {
      const chunks = Array.from({ length: 20 }, (_, i) => chunk(`S${i}`, [1, 0], i, 'x'));

      expect(topChunks(index(chunks), [1, 0], BIG)).toHaveLength(8);
      expect(topChunks(index(chunks), [1, 0], BIG, 3)).toHaveLength(3);
    });
  });

  describe('an index that cannot be scored against', () => {
    // Two embedding spaces have no relationship, so the numbers would be arithmetic without
    // meaning — confidently ranked noise, which is worse than an empty answer.
    it('returns nothing when the query came from a different-sized model', () => {
      expect(topChunks(index([PYTHON]), [1, 0, 0], BIG)).toEqual([]);
    });

    it('returns nothing for an empty query vector', () => {
      expect(topChunks(index([PYTHON]), [], BIG)).toEqual([]);
    });

    it('skips an individual chunk whose vector is the wrong width', () => {
      const wrong = { ...chunk('Wrong', [1, 0, 0], 0) };

      const result = topChunks(index([wrong, PYTHON]), [1, 0], BIG);

      expect(result.map((c) => c.heading)).toEqual(['Python']);
    });

    it('returns nothing for an index with no chunks', () => {
      expect(topChunks(index([]), [1, 0], BIG)).toEqual([]);
    });
  });
});
