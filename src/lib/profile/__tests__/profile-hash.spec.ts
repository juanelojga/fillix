import { describe, it, expect } from 'vitest';
import { hashProfile } from '../profile-hash';

describe('hashProfile', () => {
  it('is stable for the same document and model', () => {
    expect(hashProfile('## Python', 'nomic-embed-text')).toBe(
      hashProfile('## Python', 'nomic-embed-text'),
    );
  });

  it('changes when the document changes', () => {
    expect(hashProfile('## Python', 'nomic')).not.toBe(hashProfile('## Python.', 'nomic'));
  });

  // Vectors from two models are not comparable at all, so switching models has to invalidate
  // the index exactly as an edit does.
  it('changes when the embedding model changes', () => {
    expect(hashProfile('## Python', 'nomic-embed-text')).not.toBe(
      hashProfile('## Python', 'mxbai-embed-large'),
    );
  });

  // Without the separator, model "ab" + document "c" and model "a" + document "bc" would be
  // the same input and would wrongly reuse each other's index.
  it('separates the model from the document', () => {
    expect(hashProfile('c', 'ab')).not.toBe(hashProfile('bc', 'a'));
  });

  it('notices a single changed character in a long document', () => {
    const long = 'word '.repeat(5000);
    expect(hashProfile(long, 'nomic')).not.toBe(hashProfile(`${long}x`, 'nomic'));
  });

  it('notices two characters being swapped', () => {
    expect(hashProfile('## Python and Go', 'n')).not.toBe(hashProfile('## Python nad Go', 'n'));
  });

  it('is always eight hex characters', () => {
    for (const input of ['', 'a', '## Python', 'word '.repeat(1000)]) {
      expect(hashProfile(input, 'nomic')).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
