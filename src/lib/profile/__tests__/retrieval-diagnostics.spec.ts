import { describe, it, expect } from 'vitest';
import { diagnoseRetrievalFailure, type RetrievalFailure } from '../retrieval-diagnostics';

const ALL: RetrievalFailure[] = [
  { reason: 'no-embed-model' },
  { reason: 'empty-profile' },
  { reason: 'no-index' },
  { reason: 'stale-index' },
  { reason: 'embed-failed', error: 'Ollama /api/embed returned 404' },
];

describe('diagnoseRetrievalFailure', () => {
  it('names a missing embedding model and the model to name', () => {
    const d = diagnoseRetrievalFailure({ reason: 'no-embed-model' });

    expect(d.summary).toBe('No embedding model chosen');
    expect(d.hint).toContain('nomic-embed-text');
  });

  // The whole design is that answers come from the user's own words and nothing else, so an
  // empty profile is the one state where there is genuinely nothing to draft from.
  it('says an empty profile is the reason, not a search that found nothing', () => {
    const d = diagnoseRetrievalFailure({ reason: 'empty-profile' });

    expect(d.summary).toBe('Your profile is empty');
    expect(d.hint).toContain('your own CV');
  });

  it('separates never-indexed from indexed-then-changed', () => {
    const never = diagnoseRetrievalFailure({ reason: 'no-index' });
    const stale = diagnoseRetrievalFailure({ reason: 'stale-index' });

    expect(never.summary).toMatch(/not been indexed/);
    expect(stale.summary).toMatch(/changed since it was indexed/);
    expect(never.summary).not.toBe(stale.summary);
  });

  it('points at the Profile tab for the embed failure rather than repeating Ollama', () => {
    const d = diagnoseRetrievalFailure({ reason: 'embed-failed', error: 'returned 404' });

    expect(d.summary).toBe("Couldn't search your profile");
    expect(d.hint).toContain('Profile tab');
  });

  // Every one of these is fixed somewhere else in the UI, and unlike the capture hints the
  // button that fixes it is not on screen when the message appears.
  it('always names where to go, on every arm', () => {
    for (const failure of ALL) {
      const d = diagnoseRetrievalFailure(failure);
      expect(d.summary.length).toBeGreaterThan(0);
      expect(d.hint).toContain('Profile tab');
    }
  });
});
