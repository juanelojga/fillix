import { AUDIT_ROWS, type AuditRowId } from './post-audit-rows';
import type { PostDraft } from './post-draft';
import {
  checkCleanOpening,
  checkClosePreconditions,
  checkLength,
  checkNoAntiPatterns,
  checkNoBannedVocab,
  checkNoExternalLinks,
  checkNoFirstCommentLink,
  checkReadingLevel,
  type AuditResult,
} from './post-audit-checks';

/**
 * Running the audit, and merging the two judges' answers.
 *
 * The rows themselves live in `post-audit-rows.ts` and the checkers in
 * `post-audit-checks.ts`; what is left here is the policy — which judge wins a disagreement,
 * and what an unanswered row counts as. That is the one thing in the audit worth reading on
 * its own.
 */

export type { AuditRowId, AuditRowSpec } from './post-audit-rows';
export { AUDIT_ROWS, DETERMINISTIC_ROW_IDS, MODEL_ROW_IDS, rowSpec } from './post-audit-rows';

export interface AuditRow extends AuditResult {
  id: AuditRowId;
}

export interface AuditReport {
  rows: AuditRow[];
  passed: boolean;
}

/** Everything a regex and a character count can settle, with no model involved. */
export function runDeterministicRows(draft: PostDraft): AuditRow[] {
  const text = draft.text;
  return [
    { id: 'length' as const, ...checkLength(text) },
    { id: 'no-external-links' as const, ...checkNoExternalLinks(text) },
    { id: 'no-first-comment-link' as const, ...checkNoFirstCommentLink(text) },
    { id: 'no-banned-vocab' as const, ...checkNoBannedVocab(text) },
    { id: 'clean-opening' as const, ...checkCleanOpening(text) },
    { id: 'reading-level' as const, ...checkReadingLevel(text) },
    { id: 'no-anti-patterns' as const, ...checkNoAntiPatterns(text) },
  ];
}

/** The close row's deterministic half, run before the model is asked to judge the rest. */
export function closePrecondition(draft: PostDraft): AuditRow {
  return { id: 'close-matches-funnel', ...checkClosePreconditions(draft.close, draft.closeKind) };
}

/**
 * The line the whole design turns on.
 *
 * A verdict whose row is deterministic is **dropped, never applied**. A model that answers
 * `{"row":"length","pass":true}` about a 640-character post cannot overturn a character count
 * — and it will try, because that is what a self-report is. This is `meeting-overlap.ts`'s
 * rule ("a model asked to subtract two clock times produces a confident number") applied to
 * prose.
 *
 * A model row the judge did not answer stays failing. Silence must not pass a run.
 */
export function mergeAuditReport(deterministic: AuditRow[], verdicts: AuditRow[]): AuditReport {
  const rows: AuditRow[] = [];

  for (const spec of AUDIT_ROWS) {
    if (spec.judge === 'deterministic') {
      const row = deterministic.find((r) => r.id === spec.id);
      rows.push(row ?? { id: spec.id, pass: false, why: '(this row was not checked)' });
      continue;
    }

    const judged = verdicts.find((r) => r.id === spec.id);
    const precondition = deterministic.find((r) => r.id === spec.id);

    // A deterministic precondition on a model row is still unappealable: the close is either
    // present and the right shape, or it is not, and no judgement changes that.
    if (precondition && !precondition.pass) {
      rows.push(precondition);
      continue;
    }

    rows.push(
      judged ?? { id: spec.id, pass: false, why: '(the reviewer did not answer this row)' },
    );
  }

  return { rows, passed: rows.every((row) => row.pass) };
}

export function failingRows(report: AuditReport): AuditRow[] {
  return report.rows.filter((row) => !row.pass);
}
