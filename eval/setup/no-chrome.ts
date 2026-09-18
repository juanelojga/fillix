/**
 * The exact opposite of `vitest.setup.ts`, and the point of the whole exercise.
 *
 * That file stubs `chrome` so unit specs can run; this one makes any access throw. The harness
 * exists to grade the real drafting pipeline, and a production path that quietly reaches for
 * `chrome.*` here would no-op into a stub and be graded as if it had worked. Failing loudly is
 * what keeps "the eval runs what ships" true rather than aspirational.
 */
Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  get(): never {
    throw new Error(
      'The eval harness must not touch chrome.* — inject the dependency instead ' +
        '(see answer-evidence.ts / question-times-port.ts).',
    );
  },
});
