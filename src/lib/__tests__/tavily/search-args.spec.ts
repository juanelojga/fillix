import { describe, it, expect } from 'vitest';
import { parseSearchArgs } from '../../tavily/search-args';

/**
 * This module exists to distrust the model, so the tests are mostly about values the type
 * signature claims cannot arrive. `detectToolCall` types its args `Record<string, string>` and
 * `JSON.parse` does not honour that — every other tool is immune only because it reads one value
 * and hands it somewhere that stringifies it.
 */
describe('parseSearchArgs', () => {
  const ok = (args: Record<string, unknown>) => {
    const parsed = parseSearchArgs(args);
    if (!parsed.ok) throw new Error(`expected ok, got: ${parsed.error}`);
    return parsed.params;
  };

  describe('query', () => {
    it('collapses whitespace and trims', () => {
      expect(ok({ query: '  svelte   5  runes \n' }).query).toBe('svelte 5 runes');
    });

    it('refuses a missing query by name, as profileSearch does', () => {
      expect(parseSearchArgs({})).toEqual({
        ok: false,
        error: 'tavily_search needs a "query" argument.',
      });
    });

    it('refuses a whitespace-only query', () => {
      expect(parseSearchArgs({ query: '   ' }).ok).toBe(false);
    });

    it('accepts a number, which JSON.parse can hand back despite the string typing', () => {
      expect(ok({ query: 2026 }).query).toBe('2026');
    });

    it('refuses an object rather than searching for "[object Object]"', () => {
      expect(parseSearchArgs({ query: { q: 'svelte' } }).ok).toBe(false);
    });

    it('refuses null', () => {
      expect(parseSearchArgs({ query: null }).ok).toBe(false);
    });

    it("truncates at Tavily's 1 500-character ceiling", () => {
      expect(ok({ query: 'a'.repeat(3_000) }).query).toHaveLength(1_500);
    });
  });

  describe('topic', () => {
    it('keeps news', () => {
      expect(ok({ query: 'q', topic: 'news' }).topic).toBe('news');
    });

    it('keeps general', () => {
      expect(ok({ query: 'q', topic: 'General' }).topic).toBe('general');
    });

    it('drops finance, which changes the index searched and is not offered', () => {
      expect(ok({ query: 'q', topic: 'finance' }).topic).toBeUndefined();
    });

    it('drops anything else rather than letting Tavily 400 on it', () => {
      expect(ok({ query: 'q', topic: 'tech' }).topic).toBeUndefined();
    });
  });

  describe('time_range', () => {
    for (const value of ['day', 'week', 'month', 'year']) {
      it(`keeps ${value}`, () => {
        expect(ok({ query: 'q', time_range: value }).timeRange).toBe(value);
      });
    }

    // These are the three phrasings a small model actually emits, and Tavily rejects all of them.
    for (const value of ['last week', '7d', 'recent']) {
      it(`drops "${value}" rather than forwarding it`, () => {
        expect(ok({ query: 'q', time_range: value }).timeRange).toBeUndefined();
      });
    }
  });

  describe('sites', () => {
    it('splits a comma-separated string, which is what the prompt asks for', () => {
      expect(ok({ query: 'q', sites: 'arxiv.org, nature.com' }).domains).toEqual([
        'arxiv.org',
        'nature.com',
      ]);
    });

    it('accepts a real array, which a larger model sends anyway', () => {
      expect(ok({ query: 'q', sites: ['arxiv.org'] }).domains).toEqual(['arxiv.org']);
    });

    it('strips scheme, www and path', () => {
      expect(ok({ query: 'q', sites: 'https://www.nature.com/articles' }).domains).toEqual([
        'nature.com',
      ]);
    });

    it('drops a bare word, which would otherwise return nothing at all', () => {
      expect(ok({ query: 'q', sites: 'science' }).domains).toBeUndefined();
    });

    it('dedupes', () => {
      expect(ok({ query: 'q', sites: 'arxiv.org,www.arxiv.org' }).domains).toEqual(['arxiv.org']);
    });

    it('caps the list, because a long one is a malfunction rather than a strategy', () => {
      const many = Array.from({ length: 20 }, (_, i) => `site${i}.com`).join(',');
      expect(ok({ query: 'q', sites: many }).domains).toHaveLength(8);
    });

    it('omits the field entirely when nothing survives', () => {
      expect(ok({ query: 'q', sites: 'nonsense' })).not.toHaveProperty('domains');
    });
  });

  // The two the model will try to raise: one sets the credit cost, the other the char budget.
  it('ignores max_results and search_depth', () => {
    const params = ok({ query: 'q', max_results: 20, search_depth: 'advanced' });
    expect(params).toEqual({ query: 'q' });
  });
});
