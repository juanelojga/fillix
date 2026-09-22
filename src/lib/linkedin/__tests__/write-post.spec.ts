import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MIN_POST_CHARS } from '../post-audit-checks';
import { MODEL_ROW_IDS } from '../post-audit';
import { MAX_REPAIR_PASSES, writePost } from '../write-post';
import type { AngleBrief } from '../write-brief';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'gemma4:12b' };

const BRIEF: AngleBrief = {
  icp: 'primary',
  pillar: 'startups',
  style: 'contrarian',
  funnel: 'tofu',
  spike: 'Boring tech ships faster.',
  hooks: [{ trigger: 'curiosity', lines: ['A', 'B', 'C'] }],
};

const INPUT = {
  brief: BRIEF,
  hook: BRIEF.hooks[0],
  research: '[1] web · Something\nhttps://example.com\nA snippet.',
  specifics: '## Python\n\nEight years.',
  voiceSpec: '# The author\n\nSenior developer.',
};

const LONG_BODY = 'We cut the build from 9 minutes to 40 seconds with esbuild. '.repeat(24);
const CLOSE = 'What did you cut first, and what broke when you did?';

function post(body = LONG_BODY) {
  return { hook: 'A line.\nA second.\nA third.', body, close: CLOSE };
}

const ALL_PASS = {
  verdicts: MODEL_ROW_IDS.map((id) => ({ row: id, pass: true, why: '' })),
};

const CLAIMS_FAIL = {
  verdicts: MODEL_ROW_IDS.map((id) => ({
    row: id,
    pass: id !== 'specific-claims',
    why: id !== 'specific-claims' ? '' : 'paragraph 3 asserts without a number',
  })),
};

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => ({ response: JSON.stringify(body) }) };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Answers each generation in order, repeating the last once the script runs out. */
function sequence(...bodies: unknown[]) {
  let i = 0;
  fetchMock = vi.fn(async () => reply(bodies[Math.min(i++, bodies.length - 1)]));
  vi.stubGlobal('fetch', fetchMock);
}

/** Answers draft, audit, draft, audit… forever — a run that never converges. */
function cycle(draft: unknown, audit: unknown) {
  let i = 0;
  fetchMock = vi.fn(async () => reply(i++ % 2 === 0 ? draft : audit));
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  sequence(post(), ALL_PASS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('writePost', () => {
  it('returns a passing post after one generation and one audit', async () => {
    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    expect(result.report.passed).toBe(true);
    expect(result.passes).toBe(0);
    expect(result.exhausted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * The ordering that saves a whole generation. A 700-character post fails `length` before the
   * model is asked anything, so the judge is never called — and the repair prompt gets the
   * unambiguous failure first, where it is cheapest to fix.
   */
  it('never spends a judge call on a post that already fails a regex', async () => {
    sequence(post('Too short.'));
    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));

    // One draft plus MAX_REPAIR_PASSES repairs, and not one audit among them.
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_REPAIR_PASSES);
    const length = result.report.rows.find((row) => row.id === 'length');
    expect(length?.pass).toBe(false);
    expect(length?.why).toContain(String(MIN_POST_CHARS));
  });

  it('repairs a model-judged failure and stops once it passes', async () => {
    sequence(post(), CLAIMS_FAIL, post(), ALL_PASS);
    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    expect(result.passes).toBe(1);
    expect(result.report.passed).toBe(true);
    expect(result.exhausted).toBe(false);
  });

  /** A silent loop makes a bad output look like a good one — `structured-reply.ts`'s rule. */
  it('stops at the repair cap rather than looping', async () => {
    cycle(post(), CLAIMS_FAIL);
    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    expect(result.passes).toBe(MAX_REPAIR_PASSES);
    expect(result.exhausted).toBe(true);
    expect(result.report.passed).toBe(false);
  });

  /**
   * Inverted from `draft-answer.ts` on purpose: there a guard throws because a fabricated
   * claim has no safe repair. Here the human is the last step, and discarding a post that is
   * 50 characters short would cost four generations to get back.
   */
  it('returns the best draft it has rather than throwing on exhaustion', async () => {
    cycle(post(), CLAIMS_FAIL);
    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    expect(result.draft.text).toContain('esbuild');
    expect(result.report.rows.some((row) => !row.pass)).toBe(true);
  });

  it('keeps the previous draft when a repair generation itself fails', async () => {
    let call = 0;
    fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return reply(post());
      if (call === 2) return reply(CLAIMS_FAIL);
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    expect(result.draft.text).toContain('esbuild');
    expect(result.exhausted).toBe(true);
    expect(result.passes).toBe(0);
  });

  /** There is no draft to return yet, so this one genuinely is an error. */
  it('propagates a failure in the very first generation', async () => {
    fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(writePost(CONFIG, INPUT, AbortSignal.timeout(2_000))).rejects.toThrow();
  });

  it('sends the repair its own authored instruction, not the judge’s wording', async () => {
    sequence(post(), CLAIMS_FAIL, post(), ALL_PASS);
    await writePost(CONFIG, INPUT, AbortSignal.timeout(2_000));
    const repair = JSON.parse(fetchMock.mock.calls[2]?.[1].body as string);
    expect(repair.prompt).toContain('Rewrite any sentence that asserts something without');
    expect(repair.prompt).toContain('paragraph 3 asserts without a number');
    expect(repair.system).toContain('Keep the hook exactly as it is');
  });
});
