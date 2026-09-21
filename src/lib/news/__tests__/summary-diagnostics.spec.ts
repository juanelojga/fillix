import { describe, it, expect } from 'vitest';
import { diagnoseSummaryFailure } from '../summary-diagnostics';

const URL_ = 'https://example.com/story';
const BASE = 'http://localhost:11434';

/** Exactly what `lib/structured-reply.ts` throws: cause on line one, model's own words on line two. */
const CUT_OFF =
  'Model output was cut off before it finished the JSON (done_reason "length")\n' +
  'raw 900 chars · head: {"summary":"The article describes… · tail: …and a request timeout';

function diagnose(stage: 'fetch' | 'summarize', error: string) {
  return diagnoseSummaryFailure(stage, error, URL_, BASE, 'llama3.2');
}

describe('diagnoseSummaryFailure', () => {
  const cases: Array<['fetch' | 'summarize', string]> = [
    ['fetch', 'fetch returned 403'],
    ['fetch', 'Could not fetch this article'],
    ['summarize', 'signal timed out'],
    ['summarize', 'Failed to fetch'],
    ['summarize', 'Model returned invalid JSON: {oops'],
    ['summarize', 'Model returned no usable summary'],
    ['summarize', CUT_OFF],
    ['summarize', 'something nobody predicted'],
  ];

  for (const [stage, error] of cases) {
    it(`gives a worded summary, a hint and the raw detail for ${stage}: ${error}`, () => {
      const d = diagnose(stage, error);
      expect(d.summary).not.toBe('');
      expect(d.hint).not.toBe('');
      // The raw error is what a user pastes into an issue — never prettify it away.
      expect(d.detail).toBe(error);
      expect(d.context).not.toBe('');
    });
  }

  it('points a fetch failure at the article url', () => {
    const d = diagnose('fetch', 'fetch returned 403');
    expect(d.summary).toBe("Couldn't read the article");
    expect(d.context).toBe(`GET ${URL_}`);
  });

  it('points a summarize failure at the ollama endpoint and model', () => {
    const d = diagnose('summarize', 'boom');
    expect(d.context).toBe(`POST ${BASE}/api/generate · model "llama3.2"`);
  });

  it('separates a timeout from an unreachable server', () => {
    expect(diagnose('summarize', 'signal timed out').summary).toContain('60s');
    expect(diagnose('summarize', 'Failed to fetch').summary).toBe('Ollama is unreachable');
  });

  /**
   * The summariser shares `generateStructured`, so it inherits the cut-off error too. Without its
   * own arm it would fall through to the generic fallback and lose the specific wording it had.
   */
  it('names a cut-off summary as cut off rather than as nothing usable', () => {
    const d = diagnose('summarize', CUT_OFF);

    expect(d.summary).toMatch(/cut off/i);
    expect(d.hint).toContain('Try again');
  });

  // Same guard as the drafting diagnostics: the timeout arm is checked first, and the raw model
  // text on line two must not reach it.
  it('does not read the model quoting "timeout" as Ollama timing out', () => {
    const d = diagnose('summarize', CUT_OFF);

    expect(d.summary).not.toMatch(/did not reply/i);
  });
});
