import { describe, it, expect } from 'vitest';
import { diagnoseDraftFailure } from '../draft-diagnostics';

const MODEL = 'qwen3:8b';

function diagnose(error: string) {
  return diagnoseDraftFailure(error, MODEL);
}

describe('diagnoseDraftFailure', () => {
  /**
   * The one failure that is working as designed: the model wrote a confident answer out of its
   * own training rather than out of the profile, and the draft was discarded on purpose. The
   * user should read that as the guard firing, not as a bug.
   */
  it('explains the grounding guard as a refusal, not a malfunction', () => {
    const d = diagnose(
      'The model answered without citing your profile, so the answer was discarded',
    );

    expect(d.cause).toBe('ungrounded');
    expect(d.summary).toMatch(/not grounded in your profile/);
    expect(d.hint).toContain('discarded rather than shown');
    expect(d.hint).toContain('Re-draft');
  });

  // Checked before the generic paths, since its message contains none of their keywords but
  // its cause is the only one the user should not treat as an error to fix.
  it('prefers the grounding reading over any other match', () => {
    expect(diagnose('Error: without citing your profile (404)').cause).toBe('ungrounded');
  });

  it('names a timeout and what a cold model costs', () => {
    const d = diagnose('The operation was aborted due to timeout');

    expect(d.cause).toBe('timeout');
    expect(d.hint).toContain(MODEL);
  });

  it('names Ollama being unreachable', () => {
    expect(diagnose('Failed to fetch').cause).toBe('unreachable');
  });

  it('names the origin check on a 403, with the variable to set', () => {
    const d = diagnose('Ollama /api/generate returned 403');

    expect(d.cause).toBe('origin-blocked');
    expect(d.hint).toContain('OLLAMA_ORIGINS');
  });

  it('names a missing model, with the exact pull command', () => {
    const d = diagnose('Ollama /api/generate returned 404');

    expect(d.cause).toBe('model-missing');
    expect(d.hint).toContain(`ollama pull ${MODEL}`);
  });

  // A small model under a long prompt does this, and the next step is a different model rather
  // than anything the user did wrong.
  it('separates malformed JSON from an empty response', () => {
    expect(diagnose('Model returned invalid JSON: {"text"').cause).toBe('bad-json');
    expect(diagnose('Model returned empty response').cause).toBe('empty');
  });

  it('names a server error', () => {
    expect(diagnose('Ollama /api/generate returned 500').cause).toBe('server-error');
  });

  it('keeps the raw error on every path', () => {
    const errors = [
      'without citing your profile',
      'Failed to fetch',
      'Ollama /api/generate returned 500',
      'something nobody predicted',
    ];

    for (const error of errors) {
      expect(diagnose(error).detail).toBe(error);
    }
  });

  // Unlike the other diagnostics modules, there is always a next step here, because Re-draft
  // is on screen beside the message whatever went wrong.
  it('always offers a next step, even for an error it cannot read', () => {
    const d = diagnose('something nobody predicted');

    expect(d.cause).toBe('unknown');
    expect(d.hint).toContain('Re-draft');
  });
});
