import { describe, it, expect } from 'vitest';
import { diagnoseSummaryFailure } from '../summary-diagnostics';

const URL_ = 'https://example.com/story';
const BASE = 'http://localhost:11434';

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
});
