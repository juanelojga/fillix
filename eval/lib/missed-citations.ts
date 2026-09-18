import type { CaseGrade } from './grade-draft.ts';

/**
 * Why `cites-expected` failed, across a whole run.
 *
 * The check counts misses; this splits them by cause, which is the only form in which the
 * number is actionable. A run at 74% has two completely different meanings: retrieval never
 * offered the section — `answer-query.ts`, the embedding, the `EVIDENCE_CHARS` budget — or it
 * did and the answer cited something else, which is `answer-prompt.ts`'s business. Tuning the
 * first for failures that were the second is how a golden set gets optimised in the wrong
 * direction.
 *
 * Its own module rather than a block in `report.ts`: that file renders whatever the grades
 * hold, and this decides what a miss means.
 */
export interface MissedCitationTally {
  /** Groups that went uncited, across every case and every sample. */
  groups: number;
  /** Of those, the ones the model was shown and ignored. */
  retrievedNotCited: number;
  /** Of those, the ones retrieval never put in front of it. */
  notRetrieved: number;
  /**
   * The headings retrieval never produced, worst first.
   *
   * Counted per group rather than per heading: a group is a set of alternatives, any one of
   * which would have satisfied the expectation, so the group is the thing that went missing.
   */
  worstUnretrieved: { group: string; count: number }[];
}

export function tallyMissedCitations(grades: CaseGrade[]): MissedCitationTally {
  const unretrieved = new Map<string, number>();
  let groups = 0;
  let retrievedNotCited = 0;

  for (const g of grades) {
    for (const m of g.missedCitations) {
      groups += 1;
      if (m.wasRetrieved) {
        retrievedNotCited += 1;
        continue;
      }
      const key = m.group.join('|');
      unretrieved.set(key, (unretrieved.get(key) ?? 0) + 1);
    }
  }

  return {
    groups,
    retrievedNotCited,
    notRetrieved: groups - retrievedNotCited,
    worstUnretrieved: [...unretrieved]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count),
  };
}
