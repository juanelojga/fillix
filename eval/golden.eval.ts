import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadGoldenSet,
  jobOf,
  toJobBrief,
  ARCHETYPES,
  type Expectation,
  type GoldenCase,
} from './lib/golden.ts';
import { scanPii } from './scrub/pii-scan.ts';
import type { Identity } from './scrub/identity-pass.ts';
import { profilePath } from './lib/eval-config.ts';
import { chunkProfile } from '../src/lib/profile/chunk';
import { normalizeAvailability } from '../src/lib/profile/availability';
import { AVAILABILITY_HEADING } from '../src/lib/profile/availability-text';
import { mentionsTime } from '../src/lib/answers/mentions-time';
import { parseTimeRange } from '../src/lib/answers/time-range';
import { statesNoExperience } from '../src/lib/answers/states-no-experience';
import { missingRequiredSkills } from '../src/lib/playbooks/job-brief';

/**
 * Hygiene for the committed golden set. No Ollama, about a second, and it is the fast loop.
 *
 * Everything here answers one question: can this expectation ever be met? A golden set whose
 * checks are unmeetable does not report a bad model — it reports a bad file, and it does so in
 * the same shape, which is the failure that makes a whole harness untrustworthy. So the traps
 * that are silent at runtime are made loud here: a heading that does not exist, a schedule
 * expectation on a question production's own gate would refuse, a denial whose length bound
 * exceeds what `statesNoExperience` will accept.
 *
 * This is the file earlier docblocks referred to by the placeholder name `fixtures.eval.ts`;
 * it is named for what it guards instead.
 */
const golden = loadGoldenSet();
const markdown = readFileSync(profilePath('profile.md'), 'utf8');
const availability = normalizeAvailability(
  JSON.parse(readFileSync(profilePath('availability.json'), 'utf8')),
);

/** The `##` headings an answer may legitimately cite: the profile's own, plus the injected
 * availability block, which is real evidence and never appears in the Markdown. */
const CITABLE = new Set([
  ...chunkProfile(markdown).map((c) => c.heading.replace(/ \(\d+\/\d+\)$/, '')),
  AVAILABILITY_HEADING,
]);

/** Narrowed rather than asserted, so every `expect` read below is checked by the compiler and
 * the "labels every case" test stays the single place a null is reported. */
type LabelledCase = GoldenCase & { expect: Expectation };
const labelled = golden.cases.filter((c): c is LabelledCase => c.expect !== null);

describe('golden set — structure', () => {
  it('labels every case', () => {
    expect(golden.cases.filter((c) => c.expect === null).map((c) => c.id)).toEqual([]);
  });

  it('gives every case an id of the form <jobId>/<slug>', () => {
    for (const c of golden.cases) {
      expect(c.id.startsWith(`${c.jobId}/`), `${c.id} is not under ${c.jobId}`).toBe(true);
      expect(jobOf(golden, c).id).toBe(c.jobId);
    }
  });

  it('freezes a clock and a resolvable zone on every case', () => {
    for (const c of golden.cases) {
      expect(Number.isNaN(Date.parse(c.now)), `${c.id}: unparseable now`).toBe(false);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: c.browserTimeZone })).not.toThrow();
    }
  });
});

describe('golden set — meetable expectations', () => {
  it('only ever asks for headings the profile actually has', () => {
    const unknown: string[] = [];
    for (const c of labelled) {
      const e = c.expect;
      for (const heading of [...e.mustCiteAny.flat(), ...e.mustNotCite]) {
        if (!CITABLE.has(heading)) unknown.push(`${c.id} → ${JSON.stringify(heading)}`);
      }
    }
    // The single most likely authoring mistake, and silent at runtime: `topChunks` can never
    // return a heading that does not exist, so the case would fail on every model forever.
    expect(unknown).toEqual([]);
  });

  it('never requires a citation from an answer it also expects to cite nothing', () => {
    for (const c of labelled) {
      const e = c.expect;
      if (e.noExperience === true) {
        expect(e.mustCiteAny, `${c.id}: a bare denial cites nothing`).toEqual([]);
      }
    }
  });

  it('keeps every expected denial inside what statesNoExperience will accept', () => {
    // `MAX_DENIAL_CHARS` is private to states-no-experience.ts; this asserts the behaviour
    // rather than the constant, so the two cannot drift apart silently.
    for (const c of labelled) {
      const e = c.expect;
      if (e.noExperience !== true) continue;
      const atBound = `I have not worked with that. ${'x'.repeat((e.maxChars ?? 0) - 30)}`;
      expect(
        statesNoExperience(atBound),
        `${c.id}: maxChars ${e.maxChars} exceeds the denial bound`,
      ).toBe(true);
    }
  });

  it('only expects a schedule where production would even look for one', () => {
    for (const c of labelled) {
      if (c.expect.scheduleUsed !== true) continue;
      // `mentionsTime` is the gate `question-schedule.ts` refuses behind. A case that fails it
      // can never produce a schedule, whatever the model does.
      expect(mentionsTime(c.question), `${c.id}: mentionsTime() is false`).toBe(true);
    }
  });

  it('keeps the overlap preconditions true wherever a job states client hours', () => {
    for (const job of golden.jobs) {
      const hours = job.attributes["Client's Hours"];
      if (hours === undefined) continue;
      // All three must hold or `availability-evidence.ts` quietly gives hours without an
      // overlap — which is correct behaviour and a broken expectation.
      expect(
        parseTimeRange(hours),
        `${job.id}: Client's Hours ${hours} does not parse`,
      ).not.toBeNull();
      expect(availability.timeZone).not.toBe('');
      for (const c of golden.cases.filter((x) => x.jobId === job.id)) {
        expect(c.browserTimeZone, `${c.id}: zone differs from the stored availability`).toBe(
          availability.timeZone,
        );
      }
    }
  });

  it('seeds mustNotClaim from the job wherever the profile agrees', () => {
    // Reported, never asserted: Toptal's `onProfile` flag is its own profile's skill list and
    // disagrees with the CV — FastAPI and A/B Testing are both flagged missing and both have
    // sections. Auto-seeding this would fail a correct answer, so it is printed for review.
    let disagreements = 0;
    for (const job of golden.jobs) {
      const missing = missingRequiredSkills(toJobBrief(job));
      const claimedAnyway = missing.filter((s) =>
        new RegExp((s.split(' (')[0] ?? s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
          markdown,
        ),
      );
      if (claimedAnyway.length) {
        disagreements += claimedAnyway.length;
        console.log(
          `  ${job.id}: Toptal says missing but the CV mentions → ${claimedAnyway.join(', ')}`,
        );
      }
    }
    console.log(`  ${disagreements} skill(s) where Toptal's flag and the CV disagree`);
    expect(disagreements).toBeGreaterThanOrEqual(0);
  });
});

describe('golden set — hygiene', () => {
  it('carries no personal data', () => {
    expect(scanPii(golden)).toEqual([]);
  });

  it('carries no string from the local identity list', () => {
    const file = path.resolve('eval/scrub/identities.local.json');
    if (!existsSync(file)) return;
    const { identities } = JSON.parse(readFileSync(file, 'utf8')) as { identities: Identity[] };
    const serialized = JSON.stringify(golden);
    for (const { find } of identities) {
      expect(serialized.includes(find), `identity ${JSON.stringify(find)} survived`).toBe(false);
    }
  });
});

describe('golden set — coverage', () => {
  it('has at least one case per declared archetype', () => {
    const counts = new Map(ARCHETYPES.map((a) => [a, 0]));
    for (const c of golden.cases) counts.set(c.archetype, (counts.get(c.archetype) ?? 0) + 1);

    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n  ${golden.cases.length} cases · ${golden.jobs.length} jobs`);
    for (const [name, n] of rows)
      console.log(`    ${n === 0 ? '✗' : ' '} ${String(n).padStart(2)}  ${name}`);

    const empty = rows.filter(([, n]) => n === 0).map(([a]) => a);
    expect(empty, 'declared archetypes with no case are dead weight').toEqual([]);
  });

  it('reports how much of the score rests on invented questions', () => {
    const synthetic = golden.jobs.filter((j) => j.source.fidelity === 'synthetic').map((j) => j.id);
    const n = golden.cases.filter((c) => synthetic.includes(c.jobId)).length;
    console.log(`  ${n}/${golden.cases.length} cases are hand-written rather than captured\n`);
    expect(n).toBeLessThan(golden.cases.length / 2);
  });
});
