import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_HOOK_CHARS } from '../brief-prompt';
import { POST_NUM_CTX } from '../post-budget';
import { BRIEF_NUM_PREDICT, normalizeAngleBrief, writeBrief } from '../write-brief';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'gemma4:12b' };

function hooks(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    trigger: 'curiosity',
    lines: [`Scroll breaker ${i}`, 'The tension', 'The payoff'],
  }));
}

const GOOD = {
  icp: 'primary',
  pillar: 'startups',
  style: 'contrarian',
  funnel: 'tofu',
  spike: 'Boring tech ships faster, and [2] says so.',
  hooks: hooks(),
};

const INPUT = {
  topic: 'Boring tech ships',
  angle: 'The dull stack wins',
  pillar: 'startups' as const,
  research: '[1] web · Something\nhttps://example.com\nA snippet.',
  specifics: '## Python\n\nEight years.',
  today: '2026-09-21',
  voiceSpec: '# The author\n\nSenior developer.',
};

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => ({ response: JSON.stringify(body) }) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(reply(GOOD));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(): { system: string; prompt: string; options?: Record<string, number> } {
  return JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
}

describe('writeBrief', () => {
  it('sends the budgets explicitly rather than inheriting Ollama defaults', async () => {
    await writeBrief(CONFIG, INPUT, AbortSignal.timeout(1_000));
    expect(sentBody().options?.num_ctx).toBe(POST_NUM_CTX);
    expect(sentBody().options?.num_predict).toBe(BRIEF_NUM_PREDICT);
  });

  /**
   * Ollama truncates an overflowing context from the start, so whatever leads is what gets
   * silently dropped. A spike with truncated evidence is merely weak; a hook that invents a
   * client name is the fabrication this design exists to stop — so the author's own words go
   * last, in the region truncation cannot reach.
   */
  it('puts the research before the profile excerpts, never after', async () => {
    await writeBrief(CONFIG, INPUT, AbortSignal.timeout(1_000));
    const prompt = sentBody().prompt;
    expect(prompt.indexOf('A snippet.')).toBeLessThan(prompt.indexOf('Eight years.'));
  });

  it('tells the model today’s date, because it has none and the research is dated', async () => {
    await writeBrief(CONFIG, INPUT, AbortSignal.timeout(1_000));
    expect(sentBody().prompt).toContain('2026-09-21');
  });

  /** Silence would let the model fill the gap from its training instead. */
  it('says so explicitly when there is no research and no profile match', async () => {
    await writeBrief(CONFIG, { ...INPUT, research: '', specifics: '' }, AbortSignal.timeout(1_000));
    const prompt = sentBody().prompt;
    expect(prompt).toContain('do not cite outside evidence at all');
    expect(prompt).toContain('do not name a client');
  });

  it('states the id rule last, where a small model will still be reading', async () => {
    await writeBrief(CONFIG, INPUT, AbortSignal.timeout(1_000));
    const lines = sentBody().system.split('\n');
    expect(lines[lines.length - 1]).toMatch(
      /^Again: "icp", "pillar", "style" and "funnel" are ids/,
    );
  });
});

describe('normalizeAngleBrief', () => {
  it('accepts a well-formed brief', () => {
    expect(normalizeAngleBrief(GOOD).spike).toContain('Boring tech ships faster');
  });

  /**
   * The point of the module. Both fields are individually valid and the pair is wrong — the
   * voice spec maps actionable to MOFU, not TOFU. No self-report catches this, because the
   * model wrote the two fields separately and has no reason to notice they disagree.
   */
  it('rejects a style the chosen funnel stage does not allow', () => {
    expect(() => normalizeAngleBrief({ ...GOOD, funnel: 'tofu', style: 'actionable' })).toThrow(
      /unusable angle brief/i,
    );
    expect(() => normalizeAngleBrief({ ...GOOD, funnel: 'mofu', style: 'listicle' })).toThrow(
      /unusable angle brief/i,
    );
  });

  it('accepts a pairing the funnel stage does allow', () => {
    expect(normalizeAngleBrief({ ...GOOD, funnel: 'mofu', style: 'analytical' }).funnel).toBe(
      'mofu',
    );
  });

  it('lets BOFU take any style, because its constraint is on the close', () => {
    expect(normalizeAngleBrief({ ...GOOD, funnel: 'bofu', style: 'listicle' }).funnel).toBe('bofu');
  });

  it('rejects a label where an id was required', () => {
    expect(() => normalizeAngleBrief({ ...GOOD, pillar: 'Building for Startups' })).toThrow();
    expect(() => normalizeAngleBrief({ ...GOOD, funnel: 'TOFU' })).toThrow();
  });

  it('rejects a brief with no spike to argue', () => {
    expect(() => normalizeAngleBrief({ ...GOOD, spike: '   ' })).toThrow();
  });

  /**
   * 210 is exactly the kind of number a model will claim to have honoured. Dropped rather
   * than truncated: cutting a hook mid-word is worse than showing two good ones.
   */
  it('drops an over-long hook rather than truncating it', () => {
    const long = { trigger: 'fear', lines: ['x'.repeat(MAX_HOOK_CHARS), 'b', 'c'] };
    expect(() => normalizeAngleBrief({ ...GOOD, hooks: [long, ...hooks(2)] })).toThrow();
    expect(normalizeAngleBrief({ ...GOOD, hooks: [long, ...hooks(3)] }).hooks).toHaveLength(3);
  });

  it('drops a hook that is not exactly three lines', () => {
    const two = { trigger: 'fear', lines: ['a', 'b'] };
    expect(normalizeAngleBrief({ ...GOOD, hooks: [two, ...hooks(3)] }).hooks).toHaveLength(3);
  });

  it('requires three usable hooks, so the picker is never a choice of one', () => {
    expect(() => normalizeAngleBrief({ ...GOOD, hooks: hooks(2) })).toThrow();
  });

  /**
   * Deliberately open, unlike the four ids: `trigger` is a label a human reads when picking a
   * hook, and closing it would reject "loss aversion" for not being in a list we invented.
   */
  it('accepts any short trigger, because it is a label and not an id', () => {
    const odd = { trigger: 'loss aversion', lines: ['a', 'b', 'c'] };
    expect(normalizeAngleBrief({ ...GOOD, hooks: [odd, ...hooks(2)] }).hooks[0].trigger).toBe(
      'loss aversion',
    );
  });

  it('drops a hook whose trigger is an essay', () => {
    const wordy = { trigger: 'x'.repeat(80), lines: ['a', 'b', 'c'] };
    expect(normalizeAngleBrief({ ...GOOD, hooks: [wordy, ...hooks(3)] }).hooks).toHaveLength(3);
  });

  it('throws the line the diagnostics arm matches', () => {
    expect(() => normalizeAngleBrief({})).toThrow(/unusable angle brief/i);
  });
});
