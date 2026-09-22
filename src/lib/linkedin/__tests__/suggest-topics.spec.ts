import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST_NUM_CTX } from '../post-budget';
import { TOPICS_NUM_PREDICT, normalizeTopicSuggestions, suggestTopics } from '../suggest-topics';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'gemma4:12b' };
const VOICE = '# The author\n\nSenior developer.';

const GOOD = {
  topics: [
    { title: 'Boring tech ships', angle: 'Why the dull stack wins', pillar: 'startups' },
    { title: 'Deleting code', angle: 'What senior looks like', pillar: 'career' },
  ],
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

describe('suggestTopics', () => {
  it('sends an explicit num_ctx — Ollama defaults to 2048 and eats the voice spec first', async () => {
    await suggestTopics(CONFIG, 'boring tech', VOICE, AbortSignal.timeout(1_000));
    expect(sentBody().options?.num_ctx).toBe(POST_NUM_CTX);
    expect(sentBody().options?.num_predict).toBe(TOPICS_NUM_PREDICT);
  });

  it('puts the voice spec in the system prompt, not the user prompt', async () => {
    await suggestTopics(CONFIG, 'boring tech', VOICE, AbortSignal.timeout(1_000));
    expect(sentBody().system).toContain('Senior developer.');
  });

  /**
   * `pitchSystemPrompt`'s pattern, pinned the way `draft-answer.spec.ts:247-257` pins it:
   * later rules dominate earlier ones for small models, and the pillar id is the one field
   * whose near-miss loses the whole suggestion.
   */
  it('states the pillar-id rule last, where a small model will still be reading', async () => {
    await suggestTopics(CONFIG, '', VOICE, AbortSignal.timeout(1_000));
    const lines = sentBody().system.split('\n');
    expect(lines[lines.length - 1]).toMatch(/^Again: "pillar" is one of /);
  });

  it('fills the seed slot rather than leaving it blank when the user typed nothing', async () => {
    await suggestTopics(CONFIG, '   ', VOICE, AbortSignal.timeout(1_000));
    expect(sentBody().prompt).toContain('No seed was given');
  });
});

describe('normalizeTopicSuggestions', () => {
  it('keeps a well-formed suggestion', () => {
    expect(normalizeTopicSuggestions(GOOD)).toHaveLength(2);
  });

  /**
   * Rejected, never repaired. Case-folding "Architecture & System Design" onto `architecture`
   * would be easy and would teach the model that the id list it was given twice is optional.
   */
  it('drops a pillar label where an id was required', () => {
    const out = normalizeTopicSuggestions({
      topics: [
        { title: 'A', angle: 'B', pillar: 'Architecture & System Design' },
        { title: 'C', angle: 'D', pillar: 'python' },
      ],
    });
    expect(out).toEqual([{ title: 'C', angle: 'D', pillar: 'python' }]);
  });

  it('drops a duplicate subject — two identical rows read as a bug, not as two topics', () => {
    const out = normalizeTopicSuggestions({
      topics: [
        { title: 'Boring tech ships', angle: 'One', pillar: 'startups' },
        { title: '  boring TECH ships ', angle: 'Two', pillar: 'startups' },
      ],
    });
    expect(out).toHaveLength(1);
  });

  it('drops a suggestion missing its angle rather than emitting a half row', () => {
    const out = normalizeTopicSuggestions({
      topics: [{ title: 'A', angle: '   ', pillar: 'career' }, ...GOOD.topics],
    });
    expect(out).toHaveLength(2);
  });

  it('caps at the five that were asked for', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `T${i}`,
      angle: 'A',
      pillar: 'career',
    }));
    expect(normalizeTopicSuggestions({ topics: many })).toHaveLength(5);
  });

  /**
   * Throws rather than returning []: an empty list is indistinguishable from "the model had
   * no ideas", which is not what happened. The message is what `post-diagnostics.ts` matches.
   */
  it('throws when nothing survived, with the line the diagnostics arm matches', () => {
    expect(() => normalizeTopicSuggestions({ topics: [] })).toThrow(/no usable topics/i);
    expect(() => normalizeTopicSuggestions({})).toThrow(/no usable topics/i);
    expect(() =>
      normalizeTopicSuggestions({ topics: [{ title: 'A', angle: 'B', pillar: 'nope' }] }),
    ).toThrow(/no usable topics/i);
  });

  it('survives rows that are not objects at all', () => {
    const out = normalizeTopicSuggestions({ topics: [null, 'a string', 7, ...GOOD.topics] });
    expect(out).toHaveLength(2);
  });
});
