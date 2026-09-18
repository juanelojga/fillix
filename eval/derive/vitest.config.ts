import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * `pnpm eval:derive` — the derivation, kept out of `pnpm eval`'s `eval/**\/*.eval.ts` glob on
 * purpose: this run *writes* `golden.json`, and a scoring run must never be able to rewrite
 * the thing it is scoring against.
 *
 * The code lives here rather than beside the data in `eval/cases/`, which `.prettierignore`
 * excludes wholesale so that a captured fixture is never reformatted. A source file under that
 * path would be silently skipped by `format:check` — present in CI, checked by nothing.
 *
 * It runs under vitest rather than `node --experimental-strip-types` (which `scrub-profile.ts`
 * uses) because `derive-golden.ts` imports `src/`, whose relative imports are extensionless;
 * Node's ESM resolver rejects those outright with `ERR_MODULE_NOT_FOUND`. vitest brings vite's
 * resolver and the same jsdom setup the parsers need, with no extra dependency — `vite-node`
 * would be the other answer, but its bin is not hoisted by pnpm and installing it here would
 * relink the whole store.
 */
export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $components: path.resolve('./src/sidepanel/components'),
    },
  },
  test: {
    environment: 'node',
    root: path.resolve('.'),
    include: ['eval/derive/derive.task.ts'],
    setupFiles: ['./eval/setup/dom.ts', './eval/setup/no-chrome.ts'],
    reporters: ['verbose'],
  },
});
