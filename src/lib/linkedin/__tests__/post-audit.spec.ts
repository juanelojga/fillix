import { describe, it, expect } from 'vitest';
import {
  AUDIT_ROWS,
  DETERMINISTIC_ROW_IDS,
  MODEL_ROW_IDS,
  closePrecondition,
  failingRows,
  mergeAuditReport,
  rowSpec,
  runDeterministicRows,
  type AuditRow,
} from '../post-audit';
import { MIN_POST_CHARS } from '../post-audit-checks';
import { assemblePost, type PostDraft } from '../post-draft';

function draft(over: Partial<PostDraft> = {}): PostDraft {
  const hook = 'A line.\nA second.\nA third.';
  const body = 'We cut the build from 9 minutes to 40 seconds with esbuild. '.repeat(24);
  const close = 'What did you cut first, and what broke when you did?';
  return {
    hook,
    body,
    close,
    closeKind: 'ctc',
    text: assemblePost(hook, body, close),
    ...over,
  };
}

const ALL_PASS: AuditRow[] = MODEL_ROW_IDS.map((id) => ({ id, pass: true, why: '' }));

describe('the audit registry', () => {
  it('gives every row a label and an authored repair instruction', () => {
    for (const row of AUDIT_ROWS) {
      expect(row.label.trim()).not.toBe('');
      expect(row.repair.trim()).not.toBe('');
    }
  });

  it('splits the rows into exactly the two judges', () => {
    expect(DETERMINISTIC_ROW_IDS.length + MODEL_ROW_IDS.length).toBe(AUDIT_ROWS.length);
    expect(MODEL_ROW_IDS).toContain('specific-claims');
    expect(DETERMINISTIC_ROW_IDS).toContain('length');
  });

  it('throws on an unknown row rather than rendering a blank label', () => {
    expect(() => rowSpec('nope' as never)).toThrow(/unknown audit row/i);
  });
});

describe('mergeAuditReport', () => {
  /**
   * The line the whole design turns on. A model answering `{"row":"length","pass":true}` about
   * a 640-character post cannot overturn a character count — and it will try, because that is
   * what a self-report is. `meeting-overlap.ts`'s rule, applied to prose.
   */
  it('drops a verdict about a deterministic row rather than applying it', () => {
    const short = draft({ body: 'Short.' });
    short.text = assemblePost(short.hook, short.body, short.close);
    expect(short.text.length).toBeLessThan(MIN_POST_CHARS);

    const lying: AuditRow[] = [
      { id: 'length' as never, pass: true, why: 'looks long enough to me' },
      ...ALL_PASS,
    ];

    const report = mergeAuditReport(runDeterministicRows(short), lying);
    const length = report.rows.find((row) => row.id === 'length');
    expect(length?.pass).toBe(false);
    expect(length?.why).toContain('must be at least');
    expect(report.passed).toBe(false);
  });

  /** Silence must not pass a run — the safe direction is amber, not green. */
  it('keeps an unanswered model row failing', () => {
    const report = mergeAuditReport(
      [...runDeterministicRows(draft()), closePrecondition(draft())],
      [],
    );
    for (const id of MODEL_ROW_IDS) {
      const row = report.rows.find((r) => r.id === id);
      expect(row?.pass).toBe(false);
      expect(row?.why).toContain('did not answer');
    }
  });

  it('passes only when every row passes', () => {
    const good = draft();
    const report = mergeAuditReport(
      [...runDeterministicRows(good), closePrecondition(good)],
      ALL_PASS,
    );
    expect(report.passed).toBe(true);
    expect(failingRows(report)).toEqual([]);
  });

  it('reports every row, in the registry order, whatever came back', () => {
    const report = mergeAuditReport([], []);
    expect(report.rows.map((r) => r.id)).toEqual(AUDIT_ROWS.map((r) => r.id));
  });

  /**
   * A model row can still have a deterministic precondition, and that half stays unappealable:
   * the close is either present and the right shape, or it is not.
   */
  it('lets a close precondition beat a passing verdict', () => {
    const noClose = draft({ close: '' });
    noClose.text = assemblePost(noClose.hook, noClose.body, '');
    const report = mergeAuditReport(
      [...runDeterministicRows(noClose), closePrecondition(noClose)],
      ALL_PASS,
    );
    const close = report.rows.find((r) => r.id === 'close-matches-funnel');
    expect(close?.pass).toBe(false);
    expect(close?.why).toContain('no close');
  });

  it('uses the verdict when the precondition passes', () => {
    const good = draft();
    const report = mergeAuditReport(
      [...runDeterministicRows(good), closePrecondition(good)],
      MODEL_ROW_IDS.map((id) => ({ id, pass: false, why: 'paragraph 3 asserts without a number' })),
    );
    const claims = report.rows.find((r) => r.id === 'specific-claims');
    expect(claims?.pass).toBe(false);
    expect(claims?.why).toContain('paragraph 3');
  });
});
