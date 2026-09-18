import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tallyMissedCitations, type MissedCitationTally } from './missed-citations.ts';
import type { CheckName, CaseGrade } from './grade-draft.ts';

/**
 * The scorecard, on screen and on disk.
 *
 * Two runs have to be diffable — model A against model B, the prompt before a change against
 * after — which is the entire reason for having a golden set rather than reading answers. So
 * the JSON carries the run's configuration beside its numbers: a score with no record of which
 * model produced it is not a measurement.
 */
const REPORTS = path.resolve('eval/reports');

export interface RunMeta {
  model: string;
  embedModel: string;
  baseUrl: string;
  samples: number;
  startedAt: string;
  /**
   * Which golden set produced these numbers.
   *
   * Two reports are only comparable when they graded the same cases against the same
   * expectations, and the whole reason this file exists is to be diffed against another one. A
   * relabelled case moves a score exactly like a better model does, so the fingerprint has to
   * travel with the result rather than be remembered.
   */
  goldenHash: string;
  goldenCases: number;
  /** The profile is the other half of the input, and editing it moves every score too. */
  profileHash: string;
}

export interface Report {
  meta: RunMeta;
  totals: { cases: number; scored: number; passed: number };
  byCheck: Record<string, { scored: number; passed: number }>;
  byArchetype: Record<string, { scored: number; passed: number }>;
  /** `cites-expected`'s failures split by cause — see `missed-citations.ts`. */
  missedCitations: MissedCitationTally;
  cases: CaseGrade[];
}

function tally(grades: CaseGrade[], key: (g: CaseGrade, c: CheckName) => string) {
  const out: Record<string, { scored: number; passed: number }> = {};
  for (const g of grades) {
    for (const r of g.checks) {
      if (r.pass === null) continue;
      const k = key(g, r.name);
      out[k] ??= { scored: 0, passed: 0 };
      out[k].scored += 1;
      if (r.pass) out[k].passed += 1;
    }
  }
  return out;
}

export function buildReport(meta: RunMeta, grades: CaseGrade[]): Report {
  return {
    meta,
    totals: {
      cases: grades.length,
      scored: grades.reduce((n, g) => n + g.scored, 0),
      passed: grades.reduce((n, g) => n + g.passed, 0),
    },
    byCheck: tally(grades, (_g, c) => c),
    byArchetype: tally(grades, (g) => g.archetype),
    missedCitations: tallyMissedCitations(grades),
    cases: grades,
  };
}

const pct = (p: number, s: number) =>
  s === 0 ? '  — ' : `${String(Math.round((p / s) * 100)).padStart(3)}%`;

export function printReport(report: Report): void {
  const { meta, totals } = report;
  console.log(`\n  model ${meta.model} · embed ${meta.embedModel} · ${meta.samples} sample(s)`);
  console.log(
    `  golden ${meta.goldenHash} (${meta.goldenCases} cases) · profile ${meta.profileHash}`,
  );
  console.log(`  ${totals.passed}/${totals.scored} checks passed across ${totals.cases} cases\n`);

  console.log('  by check');
  for (const [name, t] of Object.entries(report.byCheck).sort(
    (a, b) => a[1].passed / a[1].scored - b[1].passed / b[1].scored,
  )) {
    console.log(
      `    ${pct(t.passed, t.scored)}  ${String(t.passed).padStart(3)}/${String(t.scored).padEnd(3)}  ${name}`,
    );
  }

  console.log('\n  by archetype (worst first)');
  for (const [name, t] of Object.entries(report.byArchetype).sort(
    (a, b) => a[1].passed / a[1].scored - b[1].passed / b[1].scored,
  )) {
    console.log(
      `    ${pct(t.passed, t.scored)}  ${String(t.passed).padStart(3)}/${String(t.scored).padEnd(3)}  ${name}`,
    );
  }

  const missed = report.missedCitations;
  if (missed.groups) {
    console.log(
      `\n  cites-expected misses: ${missed.groups} — ${missed.notRetrieved} never retrieved, ` +
        `${missed.retrievedNotCited} retrieved but not cited`,
    );
    for (const { group, count } of missed.worstUnretrieved.slice(0, 8)) {
      console.log(`    ${String(count).padStart(3)}×  ${group}`);
    }
  }

  const failed = report.cases.filter((g) => g.passed < g.scored);
  if (failed.length) {
    console.log(`\n  ${failed.length} case(s) with at least one failed check`);
    for (const g of failed) {
      console.log(`    ${g.id}  [${g.archetype}]`);
      for (const r of g.checks.filter((x) => x.pass === false)) {
        console.log(`        ✗ ${r.name}: ${r.detail}`);
      }
    }
  }
  console.log('');
}

export function writeReport(report: Report): string {
  mkdirSync(REPORTS, { recursive: true });
  const stamp = report.meta.startedAt.replace(/[:.]/g, '-');
  const file = path.join(REPORTS, `${stamp}-${report.meta.model.replace(/[^\w.-]/g, '_')}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}
