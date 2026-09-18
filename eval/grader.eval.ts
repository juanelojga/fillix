import { describe, it, expect } from 'vitest';
import { gradeCase, type CaseGrade } from './lib/grade-draft.ts';
import type { CaseRun } from './lib/draft-case.ts';
import type { GoldenCase, Expectation } from './lib/golden.ts';

/**
 * The grader, graded. No Ollama, part of the fast loop.
 *
 * `gradeKnownOutput` already exists on the argument that a grader which passes everything is
 * not a grader — but it can only replay what a capture happened to contain, and no capture
 * contains a first-person pitch. So the pitch checks are the ones with nothing behind them:
 * they would report a clean sheet whether they worked or not, and a check nobody has ever seen
 * fail is indistinguishable from a model that never fails.
 *
 * Hand-built `CaseRun`s rather than fixtures on disk. What is under test is the grading of a
 * draft, and a draft is four fields; putting them in a file would add a loader and hide the
 * input being graded from the assertion about it.
 */

const CHUNK = {
  heading: 'React, Next.js and TypeScript',
  text: '## React, Next.js and TypeScript\n\nEight years of React across marketplace surfaces.',
  score: 0.8,
};
const AVAIL = '## Meeting availability\n\nWeekdays 08:00-09:00 and 11:00-17:00.';

function run(text: string, drewOn: string[]): CaseRun {
  return {
    ok: true,
    applicantName: 'Alex Rivera',
    draft: { text, drewOn, gaps: [], noExperience: text !== '' && drewOn.length === 0 },
    assembled: {
      ok: true,
      job: 'Job description:\nReact work.',
      evidence: [CHUNK.text, AVAIL].join('\n\n---\n\n'),
      schedule: null,
      chunks: [CHUNK],
      availabilityBlock: AVAIL,
    },
  };
}

const CASE: GoldenCase = {
  id: 'probe/pitch',
  jobId: 'probe',
  archetype: 'pitch',
  kind: 'pitch',
  question: 'Third-person pitch',
  minChars: 180,
  now: '2026-09-17T14:00:00-05:00',
  browserTimeZone: 'America/Guayaquil',
  notes: '',
  expect: {
    grounded: true,
    noExperience: null,
    mustCiteAny: [],
    mustNotCite: [],
    mustNotClaim: [],
    mustMentionAny: [],
    mustNotMention: [],
    scheduleUsed: null,
    maxChars: 2000,
    allowEmpty: true,
  },
};

const verdict = (g: CaseGrade, name: string) => g.checks.find((c) => c.name === name);

const GOOD =
  'Alex Rivera has spent nine years building full-stack systems, most recently taking over ' +
  'marketplace surfaces already serving hundreds of thousands of users and extending them. ' +
  'His React and TypeScript work lines up directly with what this engagement needs, and he ' +
  'has shipped Next.js applications into production throughout that time.';

describe('the pitch checks fire on what they exist to catch', () => {
  it('passes a good third-person pitch', () => {
    const g = gradeCase(CASE, run(GOOD, [CHUNK.heading]));
    for (const n of ['pitch-voice', 'pitch-not-a-denial', 'pitch-substance'])
      expect(verdict(g, n)?.pass, `${n}: ${verdict(g, n)?.detail}`).toBe(true);
  });

  it('fails a first-person pitch', () => {
    const first = GOOD.replace('Alex Rivera has', 'I have')
      .replace('His', 'My')
      .replace('he has', 'I have');
    const c = verdict(gradeCase(CASE, run(first, [CHUNK.heading])), 'pitch-voice');
    expect(c?.pass).toBe(false);
    console.log(`  first-person → ${c?.detail}`);
  });

  it('fails a pitch that never names the subject', () => {
    const anon = GOOD.replace('Alex Rivera has', 'The candidate has');
    const c = verdict(gradeCase(CASE, run(anon, [CHUNK.heading])), 'pitch-voice');
    expect(c?.pass).toBe(false);
    console.log(`  unnamed → ${c?.detail}`);
  });

  it('fails a third-person denial written where an empty pitch belongs', () => {
    const denial =
      'Alex Rivera has no experience with COBOL, SAP ABAP or Solidity, and nothing in his background matches this engagement.';
    const g = gradeCase(CASE, run(denial, [CHUNK.heading]));
    expect(verdict(g, 'pitch-not-a-denial')?.pass).toBe(false);
    // The check denial-shape structurally cannot make: NEGATION is first person only.
    expect(verdict(g, 'denial-shape')?.detail).toBe('answered');
    console.log(`  denial → ${verdict(g, 'pitch-not-a-denial')?.detail}`);
  });

  it('fails a pitch grounded only on the injected hours', () => {
    const hours =
      'Alex Rivera is available weekdays from 08:00 to 09:00 and 11:00 to 17:00, which gives this engagement a full working overlap every day of the week without exception.';
    const g = gradeCase(CASE, run(hours, ['Meeting availability']));
    expect(verdict(g, 'pitch-substance')?.pass).toBe(false);
    console.log(`  hours-only → ${verdict(g, 'pitch-substance')?.detail}`);
  });

  it('scores an empty pitch on neither voice nor substance', () => {
    const g = gradeCase(CASE, run('', []));
    for (const n of ['pitch-voice', 'pitch-not-a-denial', 'pitch-substance'])
      expect(verdict(g, n)?.pass, n).toBeNull();
  });

  it('scores nothing pitch-shaped on a question', () => {
    const g = gradeCase(
      { ...CASE, kind: 'question', archetype: 'supported-skill' },
      run('I have eight years of React.', [CHUNK.heading]),
    );
    for (const n of ['pitch-voice', 'pitch-not-a-denial', 'pitch-substance'])
      expect(verdict(g, n)?.pass, n).toBeNull();
  });

  it('fails a forbidden citation', () => {
    const expected = CASE.expect as Expectation;
    const c = { ...CASE, expect: { ...expected, mustNotCite: ['Meeting availability'] } };
    const g = gradeCase(c, run(GOOD, [CHUNK.heading, 'Meeting availability']));
    expect(verdict(g, 'no-forbidden-citation')?.pass).toBe(false);
    console.log(`  forbidden citation → ${verdict(g, 'no-forbidden-citation')?.detail}`);
  });
});

/**
 * The split a `cites-expected` failure is read by.
 *
 * Both halves fail the check identically, so nothing about the score distinguishes them — and
 * they have opposite fixes. Untested, the classification could be inverted in every run without
 * a single number moving, which is the state `mustNotCite` was in before it got a check.
 */
describe('a missed citation records whether it was ever on offer', () => {
  const withGroups = (groups: string[][]): GoldenCase => ({
    ...CASE,
    expect: { ...(CASE.expect as Expectation), mustCiteAny: groups },
  });

  it('marks a group that reached the model and went uncited', () => {
    // The chunk is in the evidence; the answer cites the availability block instead.
    const g = gradeCase(withGroups([[CHUNK.heading]]), run(GOOD, ['Meeting availability']));
    expect(verdict(g, 'cites-expected')?.pass).toBe(false);
    expect(g.missedCitations).toEqual([{ group: [CHUNK.heading], wasRetrieved: true }]);
    expect(verdict(g, 'cites-expected')?.detail).toContain('retrieved, not cited');
    console.log(`  shown and ignored → ${verdict(g, 'cites-expected')?.detail}`);
  });

  it('marks a group retrieval never produced', () => {
    const g = gradeCase(
      withGroups([['PostgreSQL and data modelling']]),
      run(GOOD, [CHUNK.heading]),
    );
    expect(verdict(g, 'cites-expected')?.pass).toBe(false);
    expect(g.missedCitations).toEqual([
      { group: ['PostgreSQL and data modelling'], wasRetrieved: false },
    ]);
    expect(verdict(g, 'cites-expected')?.detail).toContain('not retrieved');
    console.log(`  never shown → ${verdict(g, 'cites-expected')?.detail}`);
  });

  it('counts one alternative in the evidence as the whole group being on offer', () => {
    // Any member satisfies the expectation, so the group was available even though the other
    // heading never existed. Marking this 'not retrieved' would send the fix to retrieval.
    const g = gradeCase(
      withGroups([['PostgreSQL and data modelling', CHUNK.heading]]),
      run(GOOD, ['Meeting availability']),
    );
    expect(g.missedCitations[0]?.wasRetrieved).toBe(true);
  });

  it('records the evidence on a run that never produced a draft', () => {
    const g = gradeCase(CASE, {
      ok: false,
      stage: 'draft',
      error: 'The model answered without citing your profile, so the answer was discarded',
      assembled: run('', []).assembled,
    });
    expect(g.retrieved).toEqual([CHUNK.heading, 'Meeting availability']);
  });
});
