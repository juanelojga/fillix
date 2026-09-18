import { statesNoExperience } from '../../src/lib/answers/states-no-experience';
import { resolveCitations } from './citations.ts';
import { unsupportedNumbers, countNumericClaims } from './claimed-numbers.ts';
import { isEmptyCheck } from '../../src/lib/answers/schedule-check';
import type { AnswerDraft } from '../../src/lib/answers/draft-answer';
import type { GoldenCase } from './golden.ts';
import type { CaseRun } from './draft-case.ts';

/**
 * Lane A: the deterministic checks, which are the only ones that carry a score.
 *
 * Every check here is decidable from the draft and the evidence that produced it, with no
 * second model involved. A local judge grading a local drafter is correlated noise, so the
 * rubric checks that need one are recorded separately and never gate.
 *
 * The check worth naming is `cites-retrieved`: production **structurally cannot** run it. The
 * guard in `normalizeAnswerDraft` only tests that `drew_on` is non-empty, so an answer citing a
 * heading it was never shown passes today. Here the retrieved chunks are in hand, so a
 * hallucinated citation is catchable — which is the single strongest reason this harness exists.
 */
export type CheckName =
  | 'grounding-guard'
  | 'cites-retrieved'
  | 'citation-format'
  | 'cites-expected'
  | 'denial-shape'
  | 'numbers-in-evidence'
  | 'no-forbidden'
  | 'must-mention'
  | 'schedule-reached-the-model'
  | 'style';

export interface CheckResult {
  name: CheckName;
  /** null when the case does not decide this check either way — reported, never scored. */
  pass: boolean | null;
  detail: string;
}

export interface CaseGrade {
  id: string;
  archetype: string;
  checks: CheckResult[];
  scored: number;
  passed: number;
  text: string;
  drewOn: string[];
  gaps: string[];
  /** Carried into the report so a per-token judgement can be added later without re-running. */
  mustNotClaim: string[];
}

const MARKDOWN = /(\*\*|^#{1,6}\s|^[-*]\s|^\d+\.\s)/m;

function check(name: CheckName, pass: boolean | null, detail = ''): CheckResult {
  return { name, pass, detail };
}

export function gradeCase(c: GoldenCase, run: CaseRun): CaseGrade {
  const expect = c.expect;
  const checks: CheckResult[] = [];
  const empty = (): CaseGrade => ({
    id: c.id,
    archetype: c.archetype,
    checks,
    scored: checks.filter((r) => r.pass !== null).length,
    passed: checks.filter((r) => r.pass === true).length,
    text: '',
    drewOn: [],
    gaps: [],
    mustNotClaim: expect?.mustNotClaim ?? [],
  });

  if (!expect) {
    checks.push(check('grounding-guard', null, 'case carries no expectation'));
    return empty();
  }

  // ── The run did not produce a draft at all.
  if (!run.ok) {
    const guardFired = /without citing your profile/i.test(run.error);
    if (guardFired) {
      // Working as designed when the case expected it, a real failure otherwise. Either way it
      // is a row in the table, never a thrown run.
      checks.push(check('grounding-guard', expect.grounded === false, `guard fired: ${run.error}`));
    } else {
      checks.push(check('grounding-guard', false, `${run.stage}: ${run.error}`));
    }
    return empty();
  }

  const { draft, assembled } = run;
  const text = draft.text.trim();
  const citations = resolveCitations(
    draft.drewOn.filter(Boolean),
    assembled.chunks,
    assembled.availabilityBlock,
  );
  /** The sections the answer actually drew on, however it chose to name them. */
  const drewOn = [
    ...new Set(citations.map((k) => k.heading).filter((h): h is string => h !== null)),
  ];

  checks.push(check('grounding-guard', expect.grounded === true, 'draft returned'));

  // ── Citations must be traceable to sections the model was actually shown.
  const invented = citations.filter((k) => k.kind === 'invented');
  checks.push(
    check(
      'cites-retrieved',
      citations.length === 0 ? null : invented.length === 0,
      invented.length
        ? `not retrieved: ${invented.map((k) => JSON.stringify(k.raw.slice(0, 60))).join(', ')}`
        : drewOn.join(' · ') || 'no citations',
    ),
  );

  // ── Traceable, but not written as a heading. Scored on its own because the fix is the
  // prompt rather than the grounding, and because folding it into the check above would hide a
  // real hallucination behind a formatting slip.
  const malformed = citations.filter((k) => k.kind === 'quoted');
  checks.push(
    check(
      'citation-format',
      citations.length === 0 ? null : malformed.length === 0,
      malformed.length
        ? `quoted the body, not the heading: ${malformed.map((k) => JSON.stringify(k.raw.slice(0, 50))).join(', ')}`
        : 'headings',
    ),
  );

  // ── Each expected group needs one hit.
  if (expect.mustCiteAny.length === 0) {
    checks.push(check('cites-expected', null, 'no citation required'));
  } else if (text === '' && expect.allowEmpty) {
    checks.push(check('cites-expected', null, 'empty draft, allowed'));
  } else {
    const missed = expect.mustCiteAny.filter((group) => !group.some((h) => drewOn.includes(h)));
    checks.push(
      check(
        'cites-expected',
        missed.length === 0,
        missed.length
          ? `missed: ${missed.map((g) => g.join('|')).join(' ; ')}`
          : drewOn.join(' · '),
      ),
    );
  }

  // ── A bare denial: production's own predicate, so the eval and the guard cannot drift.
  if (expect.noExperience === null) {
    checks.push(check('denial-shape', null, draft.noExperience ? 'denial' : 'answered'));
  } else if (expect.noExperience) {
    const ok = statesNoExperience(text) && drewOn.length === 0;
    checks.push(
      check(
        'denial-shape',
        ok,
        ok
          ? 'bare denial'
          : `statesNoExperience=${statesNoExperience(text)} drewOn=${drewOn.length}`,
      ),
    );
  } else {
    checks.push(
      check(
        'denial-shape',
        !draft.noExperience,
        draft.noExperience ? 'denied unexpectedly' : 'answered',
      ),
    );
  }

  // ── Every year and tenure in the answer must appear in the evidence that produced it.
  const claims = countNumericClaims(text);
  const unsupported = unsupportedNumbers(text, assembled.evidence);
  checks.push(
    check(
      'numbers-in-evidence',
      claims === 0 ? null : unsupported.length === 0,
      unsupported.length
        ? `not in evidence: ${[...new Set(unsupported)].join(', ')}`
        : `${claims} checked`,
    ),
  );

  // ── Exact substrings that must be absent whatever the framing.
  const lower = text.toLowerCase();
  const forbidden = expect.mustNotMention.filter((s) => lower.includes(s.toLowerCase()));
  checks.push(
    check(
      'no-forbidden',
      expect.mustNotMention.length === 0 ? null : forbidden.length === 0,
      forbidden.length ? `mentioned: ${forbidden.join(', ')}` : 'clean',
    ),
  );

  // ── Synonym groups: each group satisfied by any one member.
  if (expect.mustMentionAny.length === 0 || (text === '' && expect.allowEmpty)) {
    checks.push(
      check('must-mention', null, text === '' ? 'empty draft, allowed' : 'nothing required'),
    );
  } else {
    const missed = expect.mustMentionAny.filter(
      (group) => !group.some((s) => lower.includes(s.toLowerCase())),
    );
    checks.push(
      check(
        'must-mention',
        missed.length === 0,
        missed.length ? `missed: ${missed.map((g) => g.join('|')).join(' ; ')}` : 'covered',
      ),
    );
  }

  // ── Did the computed schedule actually reach the model?
  if (expect.scheduleUsed === null) {
    checks.push(
      check('schedule-reached-the-model', null, assembled.schedule ? 'computed' : 'none'),
    );
  } else {
    const s = assembled.schedule;
    const reached =
      s !== null && !isEmptyCheck(s) && (s.slots.length > 0 || s.recurring.length > 0);
    checks.push(
      check(
        'schedule-reached-the-model',
        reached === expect.scheduleUsed,
        s === null
          ? 'no schedule computed'
          : `${s.slots.length} slot(s), ${s.recurring.length} recurring, ${s.unchecked.length} unchecked`,
      ),
    );
  }

  // ── Shape: length bounds, no markdown, and the voice each kind is written in.
  const problems: string[] = [];
  if (text === '' && !expect.allowEmpty) problems.push('empty draft');
  if (expect.maxChars !== null && text.length > expect.maxChars)
    problems.push(`${text.length} chars > ${expect.maxChars}`);
  if (text !== '' && c.minChars > 0 && text.length < c.minChars)
    problems.push(`${text.length} chars < the page's ${c.minChars} minimum`);
  if (MARKDOWN.test(text)) problems.push('contains markdown');
  checks.push(check('style', problems.length === 0, problems.join('; ') || `${text.length} chars`));

  return {
    id: c.id,
    archetype: c.archetype,
    checks,
    scored: checks.filter((r) => r.pass !== null).length,
    passed: checks.filter((r) => r.pass === true).length,
    text,
    drewOn: draft.drewOn,
    gaps: draft.gaps,
    mustNotClaim: expect.mustNotClaim,
  };
}

/** Replay an answer that already exists — the prior output sitting in a capture's textarea —
 * as if a model had just produced it. A grader that passes everything is not a grader, and
 * this is the cheapest way to find out. */
export function gradeKnownOutput(c: GoldenCase, run: CaseRun, knownOutput: string): CaseGrade {
  if (!run.ok) return gradeCase(c, run);
  const draft: AnswerDraft = {
    text: knownOutput,
    drewOn: [],
    gaps: [],
    noExperience: knownOutput !== '' && statesNoExperience(knownOutput),
  };
  return gradeCase(c, { ...run, draft });
}
