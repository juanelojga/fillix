/**
 * A local shim rather than `@types/jsdom`.
 *
 * The harness needs exactly one thing from jsdom — a window to take DOM constructors off — and
 * pulling a full transitive type package for that would add a dependency the repo does not
 * otherwise want. Narrow on purpose: `window` is a bag of globals here, and typing it as such
 * keeps `setup/dom.ts` honest about the fact that it is copying names, not using an API.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Record<string, unknown>;
  }
}
