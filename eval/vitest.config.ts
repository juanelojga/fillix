import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The eval harness, deliberately a separate config from `vitest.config.ts`.
 *
 * `include` keeps `pnpm test` from ever picking up a file that talks to a live Ollama, and
 * `pnpm eval` from picking up a unit spec. The two suites share no glob.
 *
 * The environment is `node` with DOM globals installed by `setup/dom.ts` from one jsdom window,
 * rather than `environment: 'jsdom'`. The jsdom environment also replaces `AbortSignal`, and
 * Node's `fetch` brand-checks its `signal` — so every Ollama call died with "Expected signal to
 * be an instance of AbortSignal". Parsing is jsdom's job here; networking and `Intl` stay
 * Node's.
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
    globals: false,
    root: path.resolve('.'),
    include: ['eval/**/*.eval.ts'],
    setupFiles: ['./eval/setup/dom.ts', './eval/setup/no-chrome.ts'],
    // A cold model on a long prompt is slow, and a whole case is many of them.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // Ollama serialises generation on one model anyway — for the reason `draftAll` states,
    // firing these in parallel would not finish sooner, only hang everything at once.
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['verbose'],
  },
});
