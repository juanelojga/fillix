import { describe, it, expect } from 'vitest';
import { diagnoseDraftFailure } from '../draft-diagnostics';

const MODEL = 'qwen3:8b';

/** Exactly what `lib/structured-reply.ts` throws: cause on line one, model's own words on line two. */
const CUT_OFF =
  'Model output was cut off before it finished the JSON (done_reason "length")\n' +
  'raw 900 chars · head: {"text":"I have extensive experience… · tail: …a multi-agent orches';

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

  // Output that finished and still was not JSON — the model ignoring the format instruction,
  // which a different model fixes. Distinct from the cut-off case below.
  it('separates malformed JSON from an empty response', () => {
    expect(diagnose('Model returned invalid JSON after 42 characters: {"text"').cause).toBe(
      'bad-json',
    );
    expect(diagnose('Model returned empty response').cause).toBe('empty');
  });

  /**
   * The failure that prompted this module's newest arm. It used to be reported as malformed JSON
   * and hinted that a larger model would fix it — untrue, it happens on gemma4:12b too.
   */
  it('names a cut-off answer as cut off rather than as bad formatting', () => {
    const d = diagnose(CUT_OFF);

    expect(d.cause).toBe('truncated');
    expect(d.summary).toMatch(/cut off/i);
    expect(d.hint).toContain('Re-draft');
  });

  /**
   * Ordering, like the grounding test above. A cut-off reply is unparseable too, so the bad-json
   * arm would happily claim it if it came first — and the user would be sent to Settings to swap
   * a model that was never the problem.
   */
  it('prefers the cut-off reading over the malformed-JSON one', () => {
    expect(
      diagnose('Model output was cut off before it finished the JSON (done_reason "length")').cause,
    ).toBe('truncated');
  });

  /**
   * The arms are checked in order with timeout and model-missing ahead of the JSON ones, and the
   * error now carries the model's own words on a second line. Matching the whole string would
   * diagnose an answer that merely mentions a timeout as Ollama timing out — it did, before the
   * cause line was split off.
   */
  it('does not read the model quoting "timeout" as Ollama timing out', () => {
    const error =
      'Model returned invalid JSON\nraw 90 chars · {"text":"I fixed a request timeout in checkout';

    expect(diagnose(error).cause).toBe('bad-json');
  });

  it('does not read the model quoting "not found" as a missing model', () => {
    const error =
      'Model returned invalid JSON\nraw 90 chars · {"text":"The page was not found so I added a 404';

    expect(diagnose(error).cause).toBe('bad-json');
  });

  it('names a server error', () => {
    expect(diagnose('Ollama /api/generate returned 500').cause).toBe('server-error');
  });

  it('keeps the raw error on every path', () => {
    const errors = [
      'without citing your profile',
      'Failed to fetch',
      'Ollama /api/generate returned 500',
      CUT_OFF,
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
