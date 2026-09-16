import { describe, it, expect } from 'vitest';
import { resolveSummaryModel } from '../summary-model';

describe('resolveSummaryModel', () => {
  it('uses the News preference when one is set', () => {
    expect(resolveSummaryModel('phi4', 'llama3.2')).toBe('phi4');
  });

  it("falls back to the active model when the preference is ''", () => {
    expect(resolveSummaryModel('', 'llama3.2')).toBe('llama3.2');
  });

  // A preference typed as spaces is not a model name — it must not reach /api/generate.
  it('treats a whitespace-only preference as no preference', () => {
    expect(resolveSummaryModel('   ', 'llama3.2')).toBe('llama3.2');
  });

  it("returns '' when neither is set, so callers can word their own empty state", () => {
    expect(resolveSummaryModel('', '')).toBe('');
  });

  // Pins the deliberate absence of a membership check: the active model need not be in
  // the hand-maintained list either, and ModelPicker surfaces an unlisted value anyway.
  it('returns a preference that is absent from any model list', () => {
    expect(resolveSummaryModel('qwen3:8b', 'llama3.2')).toBe('qwen3:8b');
  });
});
