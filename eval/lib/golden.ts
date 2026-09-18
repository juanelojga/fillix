import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { JobBrief, SkillMention } from '../../src/lib/playbooks/job-brief';

/**
 * The shape of `eval/cases/golden.json` — the committed golden set.
 *
 * Jobs and cases are two arrays rather than one nested tree because a job carries a
 * multi-thousand-character description and roughly six questions hang off it. Nesting would
 * write that description once per case in the diff; cross-referencing by `jobId` writes it once
 * in the file.
 *
 * This module knows the *shape* only. Whether an expectation is meetable — that its headings
 * exist in the profile, that its schedule preconditions hold — is `golden.eval.ts`'s job, and
 * the split is deliberate: those checks need the frozen world loaded, and a loader that needed
 * the profile to parse a file could not be used by the derivation CLI that writes it.
 */

/**
 * What a question is testing. Twenty-three of these were read off the eight real captures; the
 * last seven are invented, and are marked as such here so a coverage report can say how much of
 * the score rests on questions no recruiter actually asked.
 */
export const REAL_ARCHETYPES = [
  'supported-skill',
  'absent-skill',
  'partial-skill',
  'compound-skill',
  'adjacent-tooling',
  'vague-stack',
  'domain-context',
  'anecdote-star',
  'process-methodology',
  'comfort-willingness',
  'yes-no-explain',
  'self-rating',
  'gap-disclosure',
  'schedule-recurring',
  'schedule-slots',
  'schedule-enumerate',
  'hours-commitment',
  'external-commitments',
  'logistics-start',
  'logistics-timeoff',
  'preference',
  'factual-one-liner',
  'pitch',
] as const;

export const SYNTHETIC_ARCHETYPES = [
  'leading-premise',
  'numeric-trap',
  'credential-check',
  'version-inflation',
  'seniority-inflation',
  'non-english',
  'unanswerable-personal',
] as const;

export const ARCHETYPES = [...REAL_ARCHETYPES, ...SYNTHETIC_ARCHETYPES];

export type Archetype = (typeof REAL_ARCHETYPES)[number] | (typeof SYNTHETIC_ARCHETYPES)[number];

/**
 * How faithful this job is to what Toptal served.
 *
 * `reformatted` is the two captures an editor rewrapped before `.prettierignore` covered the
 * incoming folder. It travels with the fixture rather than living in a README, because the
 * limitation is a property of the data and outlives anyone's memory of it.
 */
export type SourceFidelity = 'faithful' | 'reformatted' | 'synthetic';

export interface GoldenJob {
  id: string;
  source: { capture: string; capturedAt: string; fidelity: SourceFidelity };
  title: string;
  /**
   * Country and industry, which is all Toptal publishes about a client — verified across all
   * eight captures: every posting says "our client" or "a global enterprise" and never a name.
   * That is why there is no `company` field to pseudonymize.
   */
  client: { country: string; industry: string };
  /** Pseudonymized for identity, otherwise the posting's own words: it is what the model reads. */
  description: string;
  /** Kept exactly as the grid was labelled — `availability-evidence.ts` matches `Client's Hours`. */
  attributes: Record<string, string>;
  skills: { required: SkillMention[]; optional: SkillMention[] };
}

/**
 * One graded expectation.
 *
 * `mustCiteAny` and `mustMentionAny` are arrays of *groups*: each inner array is satisfied by
 * any one of its members, and every group must be satisfied. A flat list could not express
 * "cites React or TypeScript, and also says something about testing".
 */
export interface Expectation {
  /** Whether `draftAnswer` must come back at all — false expects the grounding guard to fire. */
  grounded: boolean;
  /** null when the archetype does not decide it either way. */
  noExperience: boolean | null;
  mustCiteAny: string[][];
  mustNotCite: string[];
  /**
   * Skills the answer must not assert hands-on experience with. Auto-seeded from
   * `missingRequiredSkills`, and judged rather than substring-matched: a correct answer to
   * "which required skill are you missing?" names every one of these.
   */
  mustNotClaim: string[];
  mustMentionAny: string[][];
  /** Exact substrings that must be absent whatever the framing. Deterministic, and rare. */
  mustNotMention: string[];
  scheduleUsed: boolean | null;
  maxChars: number | null;
  /** True where an empty draft is the honest outcome — an unsupportable pitch, mainly. */
  allowEmpty: boolean;
}

export interface GoldenCase {
  /** `<jobId>/<slug>`. Also the drafts-map key, so it must not move when a label is reworded. */
  id: string;
  jobId: string;
  archetype: Archetype;
  kind: 'question' | 'pitch';
  question: string;
  minChars: number;
  /** Frozen ISO instant: `renderAvailability`, `resolveAt` and `zoneOffsetAt` all take a clock. */
  now: string;
  browserTimeZone: string;
  /** null means derived but not yet labelled. `golden.eval.ts` fails on one, loudly. */
  expect: Expectation | null;
  notes: string;
  /**
   * What the page already held — for several captures, Fillix's own prior output. Replayed
   * through the grader as known-bad input, because a grader that passes everything is not one.
   */
  knownOutput?: string;
}

export interface GoldenSet {
  version: number;
  jobs: GoldenJob[];
  cases: GoldenCase[];
}

export const GOLDEN_PATH = path.resolve('eval/cases/golden.json');

function fail(message: string): never {
  throw new Error(`golden.json: ${message}`);
}

/** Shape validation only, and it throws rather than returning a result: a malformed golden set
 * has no partial reading worth grading. */
export function loadGoldenSet(file: string = GOLDEN_PATH): GoldenSet {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as GoldenSet;

  if (parsed.version !== 1) fail(`unsupported version ${String(parsed.version)}`);
  if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.cases))
    fail('jobs/cases must be arrays');

  const jobIds = new Set<string>();
  for (const job of parsed.jobs) {
    if (!job.id) fail('a job has no id');
    if (jobIds.has(job.id)) fail(`duplicate job id ${job.id}`);
    jobIds.add(job.id);
  }

  const caseIds = new Set<string>();
  for (const c of parsed.cases) {
    if (!c.id) fail('a case has no id');
    if (caseIds.has(c.id)) fail(`duplicate case id ${c.id}`);
    caseIds.add(c.id);
    if (!jobIds.has(c.jobId)) fail(`case ${c.id} references unknown job ${c.jobId}`);
    if (!ARCHETYPES.includes(c.archetype))
      fail(`case ${c.id} has unknown archetype ${c.archetype}`);
  }

  return parsed;
}

/**
 * A golden job is a `JobBrief` plus a title and a company, so it goes to `buildJobContext`
 * unchanged. Keeping that true is why `attributes` and `skills` are stored verbatim.
 */
export function toJobBrief(job: GoldenJob): JobBrief {
  return { description: job.description, attributes: job.attributes, skills: job.skills };
}

/**
 * The `<slug>` half of a case id. Defined here rather than in the derivation CLI because
 * `golden.eval.ts` asserts ids are of the form `<jobId>/<slug>`, and one owner of the rule
 * means the check and the generator cannot disagree about what a slug is.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/**
 * A canonical projection of everything that can move a score, and nothing else.
 *
 * `notes` and `source` are deliberately excluded. They are for the reader, so hashing them
 * would mark two runs incomparable because somebody improved a comment — a fingerprint that
 * cries wolf gets ignored, and then it is not protecting anything. What is in: the questions
 * asked, the expectations they are graded against, and the job text the model is shown.
 */
export function goldenFingerprintInput(set: GoldenSet): string {
  return JSON.stringify({
    jobs: set.jobs.map((j) => ({
      id: j.id,
      description: j.description,
      attributes: j.attributes,
      skills: j.skills,
    })),
    cases: set.cases.map((c) => ({
      id: c.id,
      jobId: c.jobId,
      kind: c.kind,
      question: c.question,
      minChars: c.minChars,
      now: c.now,
      browserTimeZone: c.browserTimeZone,
      expect: c.expect,
    })),
  });
}

export function jobOf(set: GoldenSet, c: GoldenCase): GoldenJob {
  const job = set.jobs.find((j) => j.id === c.jobId);
  if (!job) fail(`case ${c.id} references unknown job ${c.jobId}`);
  return job;
}
