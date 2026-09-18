import { JSDOM } from 'jsdom';

/**
 * DOM globals for the harness, from **one** jsdom window — and nothing else from it.
 *
 * The environment is `node`, not `jsdom`, on purpose. Vitest's jsdom environment also replaces
 * `AbortSignal`/`AbortController`/`fetch`, and Node's `fetch` brand-checks its `signal`: a
 * jsdom-realm signal makes every Ollama call die with "Expected signal to be an instance of
 * AbortSignal". The harness needs jsdom for parsing and Node for networking, so which realm
 * owns what is stated here rather than left to a default.
 *
 * All of these come from a single window because `capture/readable-text.ts` does
 * `el instanceof HTMLTextAreaElement` against nodes produced by this same `DOMParser`. Mixing
 * windows would make those checks return **false** rather than throw — silently dropping every
 * form-control value out of the decoded text, which is the kind of failure that surfaces as a
 * slightly worse answer three layers downstream.
 *
 * Anything not listed is deliberately absent: a missing global is a loud `ReferenceError`,
 * which is the correct outcome for a module the harness was not meant to be running.
 */
const { window } = new JSDOM('<!doctype html><html><body></body></html>');

const DOM_GLOBALS = [
  'DOMParser',
  'XMLSerializer',
  'Node',
  'NodeFilter',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLOptionElement',
  'HTMLFormElement',
  'Document',
  'DocumentFragment',
  'Text',
  'Comment',
  'getComputedStyle',
] as const;

for (const key of DOM_GLOBALS) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: window[key],
  });
}
