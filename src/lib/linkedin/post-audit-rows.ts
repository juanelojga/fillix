/**
 * The audit's rows: what each one is called, who judges it, and how it is repaired.
 *
 * Split from `post-audit.ts` because the two change for different reasons. This file changes
 * when Juan re-reads the algorithm and rewords a row or its repair instruction; that one
 * changes when the *policy* does — which judge wins, and what an unanswered row counts as.
 * It is the same split as `toptal-job-url.ts` against `toptal-job-sections.ts`: the menu of
 * things, and the machinery that works on them.
 */

export type AuditRowId =
  | 'length'
  | 'no-external-links'
  | 'no-first-comment-link'
  | 'no-banned-vocab'
  | 'clean-opening'
  | 'reading-level'
  | 'no-anti-patterns'
  | 'close-matches-funnel'
  | 'specific-claims'
  | 'voice-test'
  | 'spike-defensible';

export interface AuditRowSpec {
  id: AuditRowId;
  judge: 'deterministic' | 'model';
  /** The row as the voice spec words it. Shown in the panel. */
  label: string;
  /** Our repair instruction. Authored here, never taken from the model. */
  repair: string;
}

/** Display order, and the order the repair prompt lists failures in. */
export const AUDIT_ROWS: AuditRowSpec[] = [
  {
    id: 'length',
    judge: 'deterministic',
    label: 'At least 1,200 characters',
    repair:
      'Add one more concrete moment from the author’s own experience. Do not pad the close and do not restate a point already made.',
  },
  {
    id: 'no-external-links',
    judge: 'deterministic',
    label: 'No external links',
    repair:
      'Remove the link entirely. Name the thing in words instead — an external link costs 20–30% of reach.',
  },
  {
    id: 'no-first-comment-link',
    judge: 'deterministic',
    label: 'No "link in the first comment"',
    repair:
      'Remove that instruction. Point at the bio or the Featured section in words, or at nothing.',
  },
  {
    id: 'no-banned-vocab',
    judge: 'deterministic',
    label: 'No generic AI vocabulary',
    repair: 'Replace the flagged word with how the author would actually say it out loud.',
  },
  {
    id: 'clean-opening',
    judge: 'deterministic',
    label: 'No opening emoji or greeting',
    repair: 'Delete the opening decoration. The hook is the first thing on the page.',
  },
  {
    id: 'reading-level',
    judge: 'deterministic',
    label: 'Reads at 7th–8th grade',
    repair: 'Split the longest sentences. One idea per sentence, and prefer the shorter word.',
  },
  {
    id: 'no-anti-patterns',
    judge: 'deterministic',
    label: 'No anti-patterns',
    repair:
      'Fix the flagged pattern: shorten the list, cut the extra em dashes, or delete the closing platitude.',
  },
  {
    id: 'close-matches-funnel',
    judge: 'model',
    label: 'Close matches the funnel stage',
    repair:
      'Rewrite the close so it matches the stage this post was written for, and so a reader would answer it in a paragraph rather than a word.',
  },
  {
    id: 'specific-claims',
    judge: 'model',
    label: 'Every claim has a number or a named specific',
    repair:
      'Rewrite any sentence that asserts something without a number, a named tool or a named moment. If nothing in the evidence supports it, cut the sentence rather than inventing support.',
  },
  {
    id: 'voice-test',
    judge: 'model',
    label: 'Sounds like the author out loud',
    repair: 'Rewrite the flagged lines the way the author would say them to a founder over coffee.',
  },
  {
    id: 'spike-defensible',
    judge: 'model',
    label: 'The spike holds up',
    repair:
      'Make the argument carry its own weight using the evidence given. Do not soften it into a truism, and do not invent support for it.',
  },
];

export const MODEL_ROW_IDS: readonly AuditRowId[] = AUDIT_ROWS.filter(
  (row) => row.judge === 'model',
).map((row) => row.id);

export const DETERMINISTIC_ROW_IDS: readonly AuditRowId[] = AUDIT_ROWS.filter(
  (row) => row.judge === 'deterministic',
).map((row) => row.id);

export function rowSpec(id: AuditRowId): AuditRowSpec {
  const spec = AUDIT_ROWS.find((row) => row.id === id);
  if (!spec) throw new Error(`Unknown audit row: ${id}`);
  return spec;
}
