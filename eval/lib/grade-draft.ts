import { statesNoExperience } from '../../src/lib/answers/states-no-experience';
import { AVAILABILITY_HEADING } from '../../src/lib/profile/availability-text';
import { resolveCitations, shownHeadings } from './citations.ts';
import { unsupportedNumbers, countNumericClaims } from './claimed-numbers.ts';
import { firstPersonHits, namesSubject, readsAsDenial } from './pitch-voice.ts';
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
  | 'no-forbidden-citation'
  | 'denial-shape'
  | 'numbers-in-evidence'
  | 'no-forbidden'
  | 'must-mention'
  | 'schedule-reached-the-model'
  /**
   * The three below score a pitch and are null for a question, so a question case keeps exactly
   * the `scored` count it had before they existed and the per-check baseline stays readable.
   *
   * They are here rather than in `src/` because production has no use for the answer: by the
   * time a pitch comes back in the wrong person the model has spent two minutes, and handing
   * the user nothing is worse than handing them prose they can reword.
   */
  | 'pitch-voice'
  | 'pitch-not-a-denial'
  | 'pitch-substance'
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
  /**
   * The sections the model was shown, in rank order. Carried for the same reason `drewOn` is:
   * a report that records only what was cited cannot answer why something was not.
   */
  retrieved: string[];
  /**
   * Every `mustCiteAny` group the answer did not satisfy, each marked with whether the evidence
   * even contained it.
   *
   * Structured rather than folded into the check's `detail`, because the aggregate that makes
   * this useful — how many misses were retrieval's fault and how many were the answer's — would
   * otherwise have to parse a sentence written for a human.
   */
  missedCitations: MissedCitation[];
}

/** A `mustCiteAny` group that went uncited, and whether it was ever on offer. */
export interface MissedCitation {
  group: string[];
  /** True when at least one heading in the group was in the evidence and the answer ignored it. */
  wasRetrieved: boolean;
}

const MARKDOWN = /(\*\*|^#{1,6}\s|^[-*]\s|^\d+\.\s)/m;

function check(name: CheckName, pass: boolean | null, detail = ''): CheckResult {
  return { name, pass, detail };
}

export function gradeCase(c: GoldenCase, run: CaseRun): CaseGrade {
  const expect = c.expect;
  const checks: CheckResult[] = [];
  // Recorded even when the run failed: a draft discarded by the guard was still handed evidence,
  // and "what was it looking at" is the first question asked of one.
  const evidence = run.ok ? run.assembled : run.assembled?.ok ? run.assembled : null;
  const retrieved = evidence ? shownHeadings(evidence.chunks, evidence.availabilityBlock) : [];
  const missedCitations: MissedCitation[] = [];
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
    retrieved,
    missedCitations: [],
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
  //
  // A miss is reported with the reason it happened, because the two reasons have opposite fixes
  // and the bare list of headings cannot tell them apart. `not retrieved` is retrieval's
  // failure — `answer-query.ts` or the evidence budget — and the model could not have passed
  // whatever it wrote. `not cited` is the answer's: the section was in front of it.
  if (expect.mustCiteAny.length === 0) {
    checks.push(check('cites-expected', null, 'no citation required'));
  } else if (text === '' && expect.allowEmpty) {
    checks.push(check('cites-expected', null, 'empty draft, allowed'));
  } else {
    missedCitations.push(
      ...expect.mustCiteAny
        .filter((group) => !group.some((h) => drewOn.includes(h)))
        .map((group) => ({ group, wasRetrieved: group.some((h) => retrieved.includes(h)) })),
    );
    checks.push(
      check(
        'cites-expected',
        missedCitations.length === 0,
        missedCitations.length
          ? `missed: ${missedCitations
              .map(
                (m) =>
                  `${m.group.join('|')} (${m.wasRetrieved ? 'retrieved, not cited' : 'not retrieved'})`,
              )
              .join(' ; ')}`
          : drewOn.join(' · '),
      ),
    );
  }

  // ── Headings the answer must not have leant on. Until now `mustNotCite` was authored,
  // validated by `golden.eval.ts` as a real heading, and then read by nothing — the one field
  // in `Expectation` that could be wrong in every case without a single test noticing.
  const forbiddenCitations = expect.mustNotCite.filter((h) => drewOn.includes(h));
  checks.push(
    check(
      'no-forbidden-citation',
      expect.mustNotCite.length === 0 ? null : forbiddenCitations.length === 0,
      forbiddenCitations.length ? `cited: ${forbiddenCitations.join(' · ')}` : 'clean',
    ),
  );

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

  // ── The pitch, on the three properties that make it one. All three are null for a question
  // and for an empty draft — '' is the correct answer to an unsupportable pitch, and grading a
  // blank for voice would fail the one outcome `pitchSystemPrompt` asks for.
  const isPitch = c.kind === 'pitch';
  const gradesPitchProse = isPitch && text !== '';

  // The voice. Stated three times in `pitchSystemPrompt`, last and loudest, and its docblock
  // records that sharing the rule with the question prompt "is what made the pitch inherit the
  // wrong voice" — a regression that has already happened once and that nothing caught.
  const slips = gradesPitchProse ? firstPersonHits(text) : [];
  const named = gradesPitchProse ? namesSubject(text, run.applicantName) : false;
  checks.push(
    check(
      'pitch-voice',
      gradesPitchProse ? slips.length === 0 && named : null,
      !gradesPitchProse
        ? isPitch
          ? 'empty draft'
          : 'not a pitch'
        : slips.length
          ? `first person: ${slips.map((w) => JSON.stringify(w)).join(', ')}`
          : named
            ? 'third person'
            : `never names ${JSON.stringify(run.applicantName || 'The applicant')}`,
    ),
  );

  // A denial written where an empty answer belongs. `denial-shape` cannot see this one:
  // `statesNoExperience`'s NEGATION is first-person only, so "Rivera has no experience with
  // Supabase" reads to it as an ordinary answer.
  const denial = gradesPitchProse && readsAsDenial(text);
  checks.push(
    check(
      'pitch-not-a-denial',
      gradesPitchProse ? !denial : null,
      !gradesPitchProse
        ? isPitch
          ? 'empty draft, the honest outcome'
          : 'not a pitch'
        : denial
          ? `opens with a denial: ${JSON.stringify(text.slice(0, 80))}`
          : 'pitches',
    ),
  );

  // Grounded in the CV rather than in the injected hours. `assembleAnswerEvidence` appends the
  // availability block to a pitch too, so citing it alone satisfies the grounding guard while
  // saying nothing whatever about the applicant's experience.
  //
  // Null on an empty draft whether or not the case allowed one, like the two checks above:
  // `style` already owns "empty where that was not allowed", and a second check failing for the
  // same reason reports one fault as two.
  const substantive = drewOn.filter((h) => h !== AVAILABILITY_HEADING);
  checks.push(
    check(
      'pitch-substance',
      gradesPitchProse ? substantive.length > 0 : null,
      !gradesPitchProse
        ? isPitch
          ? 'empty draft'
          : 'not a pitch'
        : substantive.join(' · ') || `only ${AVAILABILITY_HEADING}`,
    ),
  );

  // ── Shape: length bounds and no markdown. Voice is `pitch-voice` above, not this.
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
    retrieved,
    missedCitations,
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
