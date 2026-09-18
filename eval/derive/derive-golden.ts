import '../setup/dom.ts';
import '../setup/no-chrome.ts';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { extractJobSections } from '../../src/lib/playbooks/toptal-job-sections';
import { buildJobBrief } from '../../src/lib/playbooks/toptal-job-brief';
import { extractApplicationFields } from '../../src/lib/playbooks/toptal-application-form';
import { applyIdentities, type Identity } from '../scrub/identity-pass.ts';
import { scanPii } from '../scrub/pii-scan.ts';
import { guessArchetype } from './guess-archetype.ts';
import {
  GOLDEN_PATH,
  slugify,
  type GoldenCase,
  type GoldenJob,
  type GoldenSet,
  type SourceFidelity,
} from '../lib/golden.ts';

/**
 * Derive `golden.json` from the raw captures: `pnpm eval:derive`.
 *
 * Runs the **production** parsers rather than a copy, so a Toptal markup change shows up here
 * as a smaller derivation rather than as a golden set that quietly disagrees with what the
 * extension sees.
 *
 * Under `vite-node`, not `node --experimental-strip-types` like `scrub-profile.ts`: this one
 * imports `src/`, whose relative imports are extensionless, and Node's ESM resolver rejects
 * those outright (verified: `ERR_MODULE_NOT_FOUND` on the first one). vite-node does not run
 * vitest's `setupFiles`, so the two setup modules are imported explicitly above — the parsers
 * need a `DOMParser` and all of its classes from one window.
 *
 * **It merges and never overwrites.** Hand-authored `expect`, `notes` and `archetype` are keyed
 * by case id and survive every re-derivation. A script that reset the labels would be run once
 * and then never again, which is the same as not having one.
 */
const INCOMING = path.resolve('eval/cases/incoming');

/**
 * The two captures an editor rewrapped before `.prettierignore` covered `incoming/`. Recorded
 * per job rather than in a README so the limitation travels with the data. Their questions are
 * still gradeable — the derivation collapses the injected newlines below — but they are not
 * evidence about Toptal's real markup.
 */
const REFORMATTED = new Set(['VjEtSm9iLTUwNDM0Mg', 'VjEtSm9iLTUwNzczNA']);

/**
 * One frozen instant for every derived case: Thursday 17 September 2026, 14:00 in Guayaquil.
 *
 * `renderAvailability`, `resolveAt` and `zoneOffsetAt` all take a clock, so without pinning it
 * the expected output changes daily and across machines. A weekday afternoon is chosen so that
 * "the next 5 business days" spans a weekend — the case `local-window.ts` splits at local
 * midnight and lands on `day: null`.
 */
const FROZEN_NOW = '2026-09-17T14:00:00-05:00';
const BROWSER_TIME_ZONE = 'America/Guayaquil';

function loadIdentities(): Identity[] {
  const file = path.resolve('eval/scrub/identities.local.json');
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as { identities: Identity[] }).identities;
}

const identities = loadIdentities();

/** Every string that reaches the committed file goes through here. No exceptions, so that a new
 * field added later cannot quietly bypass scrubbing. */
function scrub(text: string): string {
  return applyIdentities(text, identities).text;
}

/** Collapses the newlines the reformatting injected into question text, and the soft wrapping
 * Toptal's own textareas carry. What is graded is the sentence, not its line breaks. */
function oneLine(text: string): string {
  return scrub(text).replace(/\s+/g, ' ').trim();
}

function jobTitle(html: string): string {
  const raw = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '';
  const decoded = raw.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // "…. Talent Portal. Toptal LLC." is chrome on every page; the job's own name is what leads.
  return oneLine(decoded.replace(/\.?\s*Talent Portal\.\s*Toptal LLC\.?\s*$/i, ''));
}

/**
 * Country and industry out of the Company Information grid, which is all Toptal states about a
 * client — no capture in the set names one, so there is nothing here to pseudonymize.
 *
 * `readable-text.ts` has already flattened the grid to `Label: value Label: value …` on one
 * line, so each value runs until the next label starts. The lookahead has to include the end of
 * the string as well: `Industry` is the last field, and a rule that only stopped at another
 * label read it as empty on every capture.
 */
const CLIENT_LABELS = ['City / Country', 'Year Founded', 'Team Size', 'Industry'];

function clientOf(body: string): { country: string; industry: string } {
  const flat = body.replace(/\s+/g, ' ');
  const stop = CLIENT_LABELS.map((l) => l.replace(/[/]/g, '\\/')).join('|');
  const field = (label: string): string => {
    const value = new RegExp(`${label}\\s*:\\s*(.*?)(?=\\s*(?:${stop})\\s*:|$)`).exec(flat)?.[1];
    return value?.trim() || 'Unknown';
  };
  return { country: field('City / Country'), industry: field('Industry') };
}

function deriveJob(file: string, html: string): { job: GoldenJob; cases: GoldenCase[] } {
  const capture = path.basename(file, '.html');
  const sections = extractJobSections(html);
  const brief = buildJobBrief(sections, html);
  const company = sections.find((s) => s.heading === 'Company Information');

  const title = jobTitle(html);
  const id = slugify(title) || slugify(capture);
  const fidelity: SourceFidelity = REFORMATTED.has(capture) ? 'reformatted' : 'faithful';

  const job: GoldenJob = {
    id,
    source: { capture, capturedAt: '2026-09-17', fidelity },
    title,
    client: clientOf(company?.body ?? ''),
    description: scrub(brief.description),
    attributes: Object.fromEntries(
      // Values are kept verbatim — `availability-evidence.ts` parses `Client's Hours` and
      // `readable-text.ts` already flattened the grid, so a reflow here would break the overlap.
      Object.entries(brief.attributes).map(([k, v]) => [k, scrub(v)]),
    ),
    skills: {
      required: brief.skills.required.map((s) => ({ ...s, name: scrub(s.name) })),
      optional: brief.skills.optional.map((s) => ({ ...s, name: scrub(s.name) })),
    },
  };

  const cases: GoldenCase[] = [];
  /**
   * Slugs collide for real: one capture asks two "From 1 to 5 where 1 is weak and 5 is
   * expert…" questions whose wording only diverges past the slug's cut. Disambiguating by
   * position within the job keeps ids stable across re-derivations — lengthening the slug
   * instead would only move the collision and would rewrite every id the day it moved.
   */
  const usedSlugs = new Map<string, number>();
  const uniqueSlug = (question: string): string => {
    const base = slugify(question);
    const seen = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  for (const field of extractApplicationFields(html)) {
    // `choice` is a radio group the extension never drafts for; grading one would score a
    // pipeline that does not run.
    if (field.kind === 'choice') continue;

    const question = oneLine(field.question);
    const { archetype, confidence } = guessArchetype(question, field.kind);
    const knownOutput = oneLine(field.prefilled);

    cases.push({
      id: `${id}/${uniqueSlug(question)}`,
      jobId: id,
      archetype,
      kind: field.kind,
      question,
      minChars: field.minChars,
      now: FROZEN_NOW,
      browserTimeZone: BROWSER_TIME_ZONE,
      expect: null,
      notes: confidence === 'low' ? 'GUESSED archetype — confirm against the profile.' : '',
      ...(knownOutput ? { knownOutput } : {}),
    });
  }

  return { job, cases };
}

/** Hand-authored fields, carried across a re-derivation. The mechanical fields refresh; these
 * are the only ones a human ever types, and losing them once would end the practice. */
function carryLabels(fresh: GoldenCase, previous: GoldenCase | undefined): GoldenCase {
  if (!previous) return fresh;
  return {
    ...fresh,
    archetype: previous.archetype,
    expect: previous.expect,
    notes: previous.notes,
  };
}

/**
 * Derive, merge and write. Returns the set it wrote so the runner can assert a postcondition
 * rather than trusting that a script which printed something did the right thing.
 */
export function deriveGoldenSet(): GoldenSet {
  const existing: GoldenSet | null = existsSync(GOLDEN_PATH)
    ? (JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenSet)
    : null;
  const previousById = new Map((existing?.cases ?? []).map((c) => [c.id, c]));

  const jobs: GoldenJob[] = [];
  const cases: GoldenCase[] = [];

  for (const file of readdirSync(INCOMING)
    .filter((f) => f.endsWith('.html'))
    .sort()) {
    const html = readFileSync(path.join(INCOMING, file), 'utf8');
    const derived = deriveJob(file, html);
    jobs.push(derived.job);
    for (const c of derived.cases) cases.push(carryLabels(c, previousById.get(c.id)));
  }

  /**
   * Cases that are in the file but no longer derivable — a hand-written adversarial case, or one
   * whose capture is gone. Kept, because the whole point of this file is to outlive the HTML.
   */
  const derivedIds = new Set(cases.map((c) => c.id));
  const keptJobIds = new Set(jobs.map((j) => j.id));
  for (const c of existing?.cases ?? []) {
    if (!derivedIds.has(c.id)) cases.push(c);
  }
  for (const j of existing?.jobs ?? []) {
    if (!keptJobIds.has(j.id)) jobs.push(j);
  }

  const set: GoldenSet = {
    version: 1,
    jobs: jobs.sort((a, b) => a.id.localeCompare(b.id)),
    cases: cases.sort((a, b) => a.id.localeCompare(b.id)),
  };

  const serialized = `${JSON.stringify(set, null, 2)}\n`;

  // The last gate before anything is written: a hit means an email, token or upload URL
  // survived, and the file must not reach git in that state. Scanned over the values, not the
  // serialization — see `pii-scan.ts` for why that distinction is not pedantic.
  const remaining = scanPii(set);
  if (remaining.length > 0) {
    const named = remaining.map((f) => `${f.path}: ${f.name}×${f.hits}`).join(', ');
    throw new Error(`Refusing to write — PII still present: ${named}`);
  }

  writeFileSync(GOLDEN_PATH, serialized, 'utf8');

  const unlabelled = set.cases.filter((c) => c.expect === null).length;
  const guessed = set.cases.filter((c) => c.notes.startsWith('GUESSED')).length;
  console.log(`${set.jobs.length} jobs · ${set.cases.length} cases → ${GOLDEN_PATH}`);
  console.log(`  ${set.cases.length - unlabelled} labelled · ${unlabelled} awaiting expect`);
  console.log(`  ${guessed} with a guessed archetype`);
  console.log(`  ${set.cases.filter((c) => c.knownOutput).length} carry prior output to replay`);

  return set;
}
