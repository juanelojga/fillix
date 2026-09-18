import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadEvalConfig, profilePath } from './lib/eval-config.ts';
import { loadOrBuildIndex } from './lib/index-cache.ts';
import { ollamaQueryEmbedder } from './lib/embed-query.ts';
import { loadGoldenSet, jobOf, goldenFingerprintInput } from './lib/golden.ts';
import { runCase, caseSignal, type CaseWorld } from './lib/draft-case.ts';
import { gradeCase, gradeKnownOutput, type CaseGrade } from './lib/grade-draft.ts';
import { buildReport, printReport, writeReport } from './lib/report.ts';
import { normalizeAvailability } from '../src/lib/profile/availability';
import { hashProfile } from '../src/lib/profile/profile-hash';

/**
 * The live run: every golden case drafted by a real model and scored on Lane A.
 *
 * Sequential on purpose. Ollama serialises generation on one model anyway — `draftAll` already
 * states this — so firing seventy-three at once would not finish sooner, it would only make
 * every case appear to hang at the same time.
 *
 * No `temperature` and no `seed` are passed anywhere. Pinning them would grade a system that
 * never ships; variance is handled by running `EVAL_SAMPLES` repeats and reporting a rate.
 *
 * `EVAL_ONLY=<substring>` narrows the run while iterating on a single archetype.
 */
const config = loadEvalConfig();
const markdown = readFileSync(profilePath('profile.md'), 'utf8');
const availability = normalizeAvailability(
  JSON.parse(readFileSync(profilePath('availability.json'), 'utf8')),
);
const golden = loadGoldenSet();
const only = process.env['EVAL_ONLY'] ?? '';
const cases = golden.cases.filter((c) =>
  only ? c.id.includes(only) || c.archetype.includes(only) : true,
);

let world: CaseWorld;

describe('answer drafting against the golden set', () => {
  beforeAll(async () => {
    const built = await loadOrBuildIndex({
      markdown,
      baseUrl: config.embed.baseUrl,
      embedModel: config.embed.model,
    });
    world = {
      chat: config.chat,
      embed: ollamaQueryEmbedder(config.embed),
      embedModel: config.embed.model,
      markdown,
      index: built.index,
      availability,
    };
    console.log(
      `\n  index: ${built.index.chunks.length} chunks · ${built.index.dim} dims · ${built.built ? 'BUILT' : 'cached'}`,
    );
    console.log(`  ${cases.length} case(s) · model ${config.chat.model}\n`);
  }, 600_000);

  it('drafts and grades every case', async () => {
    const grades: CaseGrade[] = [];

    for (const c of cases) {
      const job = jobOf(golden, c);
      for (let sample = 0; sample < config.samples; sample += 1) {
        const run = await runCase(world, job, c, caseSignal());
        const grade = gradeCase(c, run);
        grades.push(config.samples > 1 ? { ...grade, id: `${grade.id}#${sample + 1}` } : grade);

        const mark = grade.scored === 0 ? '·' : grade.passed === grade.scored ? '✓' : '✗';
        console.log(
          `  ${mark} ${String(grade.passed).padStart(2)}/${String(grade.scored).padEnd(2)} ${c.id.slice(0, 84)}`,
        );

        // The prior Fillix output already in the page, replayed as if it were fresh. It is
        // labelled known-bad, so a grader that passes it is the thing to fix.
        if (c.knownOutput && sample === 0) {
          const replay = gradeKnownOutput(c, run, c.knownOutput);
          console.log(
            `      replay of prior output: ${replay.passed}/${replay.scored} — ${
              replay.checks
                .filter((r) => r.pass === false)
                .map((r) => r.name)
                .join(', ') || 'all passed (suspicious)'
            }`,
          );
        }
      }
    }

    const report = buildReport(
      {
        model: config.chat.model,
        embedModel: config.embed.model,
        baseUrl: config.chat.baseUrl,
        samples: config.samples,
        startedAt: new Date().toISOString(),
        // `hashProfile` is FNV-1a over (label, text) — reused rather than reimplemented, which
        // is also why the label is passed where it expects an embed model.
        goldenHash: hashProfile(goldenFingerprintInput(golden), 'golden'),
        goldenCases: golden.cases.length,
        profileHash: hashProfile(markdown, config.embed.model),
      },
      grades,
    );
    printReport(report);
    console.log(`  report → ${writeReport(report)}\n`);

    // The suite asserts that the harness ran, not that the model was good: a score is a
    // measurement to read, and failing CI on it would make every prompt experiment look like a
    // broken build.
    expect(grades.length).toBe(cases.length * config.samples);
    expect(report.totals.scored).toBeGreaterThan(0);
  }, 3_600_000);
});
