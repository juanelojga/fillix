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
import { PITCH_QUESTION } from '../src/lib/playbooks/toptal-pitch-field';
import { applicantName } from '../src/lib/profile/applicant-name';
import { firstPersonHits, namesSubject, readsAsDenial } from './lib/pitch-voice.ts';

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

describe('golden set — pitch cases', () => {
  const pitches = labelled.filter((c) => c.kind === 'pitch');

  it('has pitch cases at all', () => {
    expect(pitches.length).toBeGreaterThan(0);
  });

  it('labels the pitch with the stable question, never the page wording', () => {
    // `PITCH_QUESTION` is the drafts-map key and the `{#each}` key, and it has already had to
    // survive Toptal relabelling the box from "Relevant experience (optional)" to "Write your
    // third-person pitch here". A case that drifted off it would grade a field production
    // cannot key.
    for (const c of pitches) expect(c.question, c.id).toBe(PITCH_QUESTION);
  });

  it('keeps every pitch archetype inside the pitch lane', () => {
    // `EVAL_ONLY` matches a substring of the id or the archetype, so this is what keeps
    // `EVAL_ONLY=pitch` selecting the whole lane rather than most of it.
    for (const c of pitches) expect(c.archetype.startsWith('pitch'), c.id).toBe(true);
  });

  it('never expects a pitch to state no experience', () => {
    // Unmeetable twice over. `pitchSystemPrompt` replaces the denial rule with "return an empty
    // text", and a third-person denial could not match `statesNoExperience` even if written.
    for (const c of pitches)
      expect(c.expect.noExperience, `${c.id}: pitches do not deny`).not.toBe(true);
  });

  it('never expects a schedule to reach a pitch', () => {
    // The pitch's `question` is a UI label, so `mentionsTime` refuses before an extraction is
    // ever spent. Asserted here as well as in the general rule, for the wording.
    for (const c of pitches) {
      expect(c.expect.scheduleUsed, c.id).not.toBe(true);
      expect(mentionsTime(c.question), c.id).toBe(false);
    }
  });

  it('leaves the length bounds satisfiable', () => {
    // `style` checks both ends. A minimum above the maximum fails every model forever, and the
    // page's minimum is the half that arrives from outside the file.
    for (const c of pitches) {
      expect(c.minChars, `${c.id}: the pitch box states a minimum`).toBeGreaterThan(0);
      if (c.expect.maxChars !== null)
        expect(c.minChars, `${c.id}: minChars ${c.minChars} > maxChars`).toBeLessThanOrEqual(
          c.expect.maxChars,
        );
    }
  });

  it('gives every captured job a pitch case', () => {
    // All eight captures carry a pitch box — seven behind `pitchInput`, one behind the older
    // `pitchThirdPersonLabel`. A captured job without a pitch case means a derivation dropped it.
    const missing = golden.jobs
      .filter((j) => j.source.fidelity !== 'synthetic')
      .filter((j) => !pitches.some((c) => c.jobId === j.id))
      .map((j) => j.id);
    expect(missing).toEqual([]);
  });
});

describe('golden set — the injected pitch subject', () => {
  const subject = applicantName(markdown);

  /** A trailing `— Profile` / `- CV` is a document title, not a name. */
  const DOCUMENT_SUFFIX = /[—–-]\s*(?:profile|cv|r[ée]sum[ée]|curriculum vitae)\s*$/i;

  it('reads a plausible name out of the frozen profile', () => {
    // KNOWN FAILURE, and deliberately loud rather than a README footnote.
    //
    // The frozen profile's H1 is `# Alex Rivera — Profile` and `applicant-name.ts` strips only
    // the `#`, so `pitchSystemPrompt` is told to refer to the applicant as "Alex Rivera —
    // Profile" and every third-person pitch opens with it. Nothing downstream can catch this:
    // the name is injected, not retrieved, so no citation check sees it, and the pitch reads
    // fluently with it.
    //
    // The fix is one line in `src/lib/profile/applicant-name.ts` plus a case in its spec, and
    // it is out of scope here on purpose — this file's job is to make the defect impossible to
    // forget, not to decide it.
    console.log(`\n  injected pitch subject: ${JSON.stringify(subject)}\n`);
    expect(subject, 'applicantName() returned nothing').not.toBe('');
    expect(subject.includes(':'), `${subject} looks like a contact line`).toBe(false);
    expect(
      DOCUMENT_SUFFIX.test(subject),
      `${JSON.stringify(subject)} is a document title, not a name — see applicant-name.ts`,
    ).toBe(false);
  });
});

describe("pitch-voice — the grader's own predicates", () => {
  // Exercised here because `golden.eval.ts` is the no-Ollama fast loop and already asserts
  // `statesNoExperience`'s behaviour the same way. `pnpm test`'s glob is `src/**`, so it can
  // never see a module under `eval/lib/`.

  it('catches the first-person forms a model actually writes', () => {
    expect(firstPersonHits('I led the migration.')).toEqual(['I']);
    expect(firstPersonHits("I've shipped it and I'm proud of my work.").sort()).toEqual([
      "I'm",
      "I've",
      'my',
    ]);
    expect(firstPersonHits('It was clear to me that mine was faster.').sort()).toEqual([
      'me',
      'mine',
    ]);
  });

  it('does not fire on the letter I inside a word or on a lowercase i', () => {
    // The reason the `I`-forms are matched case-sensitively and the others are not.
    expect(firstPersonHits('AI, UI and CI work, plus i18n and I18n support.')).toEqual([]);
    expect(firstPersonHits('the i in the identifier')).toEqual([]);
  });

  it('accepts any significant word of the subject as naming it', () => {
    expect(namesSubject('Rivera led the migration.', 'Alex Rivera')).toBe(true);
    expect(namesSubject('Alex led the migration.', 'Alex Rivera')).toBe(true);
    expect(namesSubject('The applicant led the migration.', '')).toBe(true);
    expect(namesSubject('They led the migration.', 'Alex Rivera')).toBe(false);
    // 'The' alone must not carry it, or every pitch would pass by accident.
    expect(namesSubject('The migration shipped.', '')).toBe(false);
  });

  it('reads a short lead-with-negation as a denial', () => {
    expect(readsAsDenial('Alex Rivera has no experience with COBOL or SAP ABAP.')).toBe(true);
    expect(readsAsDenial('He has never worked with Solidity.')).toBe(true);
    expect(readsAsDenial('The applicant lacks the required mainframe background.')).toBe(true);
  });

  it('does not read a gap named inside a real pitch as a denial', () => {
    // `pitchSystemPrompt` explicitly permits "Name a gap once, briefly, and move on", so this
    // is the false positive that would fail correct pitches if the scan were loose.
    const pitch =
      'Alex Rivera has spent nine years building full-stack systems, most recently taking over ' +
      'marketplace surfaces already serving hundreds of thousands of users and extending them. ' +
      'He has not worked with Kubernetes, but he has run containerised services through CI and ' +
      'into production throughout that time. His Python and FastAPI work lines up closely with ' +
      'the backend described here, and his React and TypeScript work with the frontend.';
    expect(readsAsDenial(pitch)).toBe(false);
    // Long enough to be a real pitch even when the negation does open it.
    expect(readsAsDenial(`While ${pitch}`)).toBe(false);
  });

  it('does not read an empty pitch as a denial', () => {
    // '' is the outcome the prompt asks for. Reading it as a failure would fail the one case
    // the empty-answer rule exists to produce.
    expect(readsAsDenial('')).toBe(false);
    expect(readsAsDenial('   ')).toBe(false);
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
