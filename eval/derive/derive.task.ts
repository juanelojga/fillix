import { describe, it, expect } from 'vitest';
import { deriveGoldenSet } from './derive-golden.ts';
import { loadGoldenSet } from '../lib/golden.ts';

/**
 * The runner for `pnpm eval:derive`. It writes a file, which is why it is not in the
 * `*.eval.ts` glob and never runs under `pnpm eval` — a scoring run must not be able to
 * rewrite the thing it is scoring against.
 *
 * It asserts rather than merely running because the derivation's failure mode is silence: a
 * selector Toptal renamed produces zero cases, not an error, and a script that printed
 * "0 jobs · 0 cases" and exited 0 would look like a successful run.
 */
describe('derive golden.json', () => {
  it('derives from the raw captures and reloads cleanly', () => {
    const written = deriveGoldenSet();

    expect(written.jobs.length).toBeGreaterThan(0);
    expect(written.cases.length).toBeGreaterThan(0);
    // Every job must contribute at least the pitch; none means a parser stopped matching.
    for (const job of written.jobs) {
      expect(written.cases.filter((c) => c.jobId === job.id).length).toBeGreaterThan(0);
    }
    // The file on disk must satisfy the loader that everything downstream uses.
    expect(loadGoldenSet().cases.length).toBe(written.cases.length);
  });
});
