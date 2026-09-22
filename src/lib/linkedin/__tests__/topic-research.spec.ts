import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { researchTopic } from '../topic-research';

const KEY = 'tvly-secret-key';
const NOW = new Date('2026-09-21T12:00:00Z');

const TAVILY_OK = {
  results: [
    {
      title: 'Small models for RAG',
      url: 'https://example.com/rag',
      content: 'A web snippet.',
      published_date: '2026-09-14T00:00:00Z',
    },
  ],
};

const HN_OK = {
  hits: [
    {
      objectID: '41234567',
      title: 'Show HN: a tiny retriever',
      url: 'https://example.com/hn',
      points: 412,
      num_comments: 88,
      created_at: '2026-09-13T00:00:00Z',
    },
  ],
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function bad(status: number, body: unknown = {}) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => '',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Routes by URL, so each source can be made to fail independently. */
function route(tavily: unknown, hn: unknown) {
  return vi.fn(async (url: string) => (String(url).includes('tavily') ? tavily : hn));
}

beforeEach(() => {
  fetchMock = route(ok(TAVILY_OK), ok(HN_OK));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('researchTopic', () => {
  it('merges both sources and degrades nothing when both answer', async () => {
    const out = await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    expect(out.degraded).toEqual([]);
    expect(out.sources.map((s) => s.origin)).toEqual(['web', 'hn']);
    expect(out.evidence).toContain('Small models for RAG');
    expect(out.evidence).toContain('Show HN: a tiny retriever');
  });

  /**
   * The failure this exists to prevent: a keyless install finding the whole playbook refused.
   * Hacker News alone is enough to write a post from, and Tavily is opt-in.
   */
  it('still researches with no Tavily key, naming the gap', async () => {
    const out = await researchTopic('', 'rag', AbortSignal.timeout(1_000), NOW);
    expect(out.sources.map((s) => s.origin)).toEqual(['hn']);
    expect(out.degraded).toHaveLength(1);
    expect(out.degraded[0].origin).toBe('web');
    expect(out.degraded[0].hint).toMatch(/settings/i);
  });

  it('sends no Tavily request at all without a key', async () => {
    await researchTopic('', 'rag', AbortSignal.timeout(1_000), NOW);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('tavily'))).toBe(false);
  });

  /**
   * Tavily's own message is the one string in the system that could carry the API key
   * somewhere it would be displayed, so only wording we authored leaves the worker.
   */
  it("never lets Tavily's own error text into the degraded row", async () => {
    fetchMock = route(bad(401, { detail: `bad key ${KEY}` }), ok(HN_OK));
    vi.stubGlobal('fetch', fetchMock);
    const out = await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    const row = out.degraded.find((d) => d.origin === 'web');
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(row?.summary).toBeTruthy();
  });

  /** Promise.allSettled, never all: one dead source must not empty the research. */
  it('keeps the Hacker News results when Tavily fails', async () => {
    fetchMock = route(bad(429), ok(HN_OK));
    vi.stubGlobal('fetch', fetchMock);
    const out = await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    expect(out.sources.map((s) => s.origin)).toEqual(['hn']);
    expect(out.degraded).toHaveLength(1);
  });

  it('keeps the Tavily results when Hacker News fails', async () => {
    fetchMock = route(ok(TAVILY_OK), bad(503));
    vi.stubGlobal('fetch', fetchMock);
    const out = await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    expect(out.sources.map((s) => s.origin)).toEqual(['web']);
    expect(out.degraded[0].origin).toBe('hn');
  });

  it('returns empty research rather than throwing when both fail', async () => {
    fetchMock = route(bad(500), bad(503));
    vi.stubGlobal('fetch', fetchMock);
    const out = await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    expect(out.evidence).toBe('');
    expect(out.degraded).toHaveLength(2);
  });

  /**
   * These four are not the model's to set. `max_results: 5` and `basic` are one credit rather
   * than two, and `include_answer: false` keeps a synthesized answer — the one thing a model
   * would quote wholesale — out of the evidence.
   */
  it('pins the Tavily request body, which is what silently costs credits if it drifts', async () => {
    await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('tavily'));
    const body = JSON.parse(call?.[1].body as string);
    expect(body.max_results).toBe(5);
    expect(body.search_depth).toBe('basic');
    expect(body.include_answer).toBe(false);
    expect(body.query).toBe('rag');
  });

  it('asks Hacker News for the topic, not for the front page', async () => {
    await researchTopic(KEY, 'rag', AbortSignal.timeout(1_000), NOW);
    const url = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('algolia'));
    expect(url).toContain('tags=story');
    expect(url).toContain('query=rag');
  });
});
