import { describe, it, expect } from 'vitest';
import { normalizeAuditVerdicts } from '../judge-post';

describe('normalizeAuditVerdicts', () => {
  it('keeps a well-formed verdict', () => {
    const out = normalizeAuditVerdicts({
      verdicts: [{ row: 'voice-test', pass: true, why: '' }],
    });
    expect(out).toEqual([{ id: 'voice-test', pass: true, why: '' }]);
  });

  it('keeps the located note on a failure, which is what steers the repair', () => {
    const out = normalizeAuditVerdicts({
      verdicts: [{ row: 'specific-claims', pass: false, why: 'paragraph 3 says "teams often"' }],
    });
    expect(out[0].why).toContain('paragraph 3');
  });

  /**
   * Dropped, not coerced. A model that stringifies a boolean is one whose judgement should not
   * be read, and coercing `"true"` would turn a confused reply into a confident pass.
   */
  it('drops a stringified boolean rather than coercing it', () => {
    expect(
      normalizeAuditVerdicts({ verdicts: [{ row: 'voice-test', pass: 'true', why: '' }] }),
    ).toEqual([]);
    expect(normalizeAuditVerdicts({ verdicts: [{ row: 'voice-test', pass: 1, why: '' }] })).toEqual(
      [],
    );
  });

  /** A failure with no reason produces no located note, so the repair would aim at nothing. */
  it('drops a failure that gives no reason', () => {
    expect(
      normalizeAuditVerdicts({ verdicts: [{ row: 'voice-test', pass: false, why: '   ' }] }),
    ).toEqual([]);
  });

  /** A deterministic row's verdict has no standing here — `mergeAuditReport` would drop it. */
  it('drops a verdict about a row the model was not asked to judge', () => {
    expect(normalizeAuditVerdicts({ verdicts: [{ row: 'length', pass: true, why: '' }] })).toEqual(
      [],
    );
    expect(
      normalizeAuditVerdicts({ verdicts: [{ row: 'invented-row', pass: true, why: '' }] }),
    ).toEqual([]);
  });

  it('keeps only the first verdict for a repeated row', () => {
    const out = normalizeAuditVerdicts({
      verdicts: [
        { row: 'voice-test', pass: false, why: 'line 4' },
        { row: 'voice-test', pass: true, why: '' },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].pass).toBe(false);
  });

  it('clears the note on a pass, so nothing renders beside a green row', () => {
    const out = normalizeAuditVerdicts({
      verdicts: [{ row: 'voice-test', pass: true, why: 'looks fine' }],
    });
    expect(out[0].why).toBe('');
  });

  it('survives a reply with no verdicts array at all', () => {
    expect(normalizeAuditVerdicts({})).toEqual([]);
    expect(normalizeAuditVerdicts({ verdicts: 'nope' })).toEqual([]);
    expect(normalizeAuditVerdicts({ verdicts: [null, 7, 'x'] })).toEqual([]);
  });
});
