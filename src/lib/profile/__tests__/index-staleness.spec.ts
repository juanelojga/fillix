import { describe, it, expect } from 'vitest';
import { isIndexStale } from '../index-staleness';
import { hashProfile } from '../profile-hash';
import type { ProfileIndex } from '../../storage';

const MARKDOWN = '## Python\n\nEight years.\n\n## React\n\nSix years.';

function storedIndex(overrides: Partial<ProfileIndex> = {}): ProfileIndex {
  return {
    hash: hashProfile(MARKDOWN, 'nomic'),
    chars: MARKDOWN.length,
    model: 'nomic',
    dim: 2,
    builtAt: 1,
    chunks: [],
    ...overrides,
  };
}

describe('isIndexStale', () => {
  it('is fresh when the document and model are unchanged', () => {
    expect(isIndexStale(storedIndex(), MARKDOWN, 'nomic')).toBe(false);
  });

  it('is stale when there has never been an index', () => {
    expect(isIndexStale(null, MARKDOWN, 'nomic')).toBe(true);
  });

  it('is stale when the document changed', () => {
    expect(isIndexStale(storedIndex(), `${MARKDOWN} more`, 'nomic')).toBe(true);
  });

  // Vectors from two models share no space, so a model change invalidates as surely as an edit.
  it('is stale when the embedding model changed', () => {
    expect(isIndexStale(storedIndex(), MARKDOWN, 'mxbai-embed-large')).toBe(true);
  });

  // The 32-bit hash is cheap to second-guess, and a length change is the commonest edit.
  it('is stale on a length change even if the hash somehow matched', () => {
    expect(isIndexStale(storedIndex({ chars: 999 }), MARKDOWN, 'nomic')).toBe(true);
  });
});
