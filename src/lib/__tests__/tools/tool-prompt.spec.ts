import { describe, it, expect } from 'vitest';
import { buildToolSystemPrompt } from '../../tools/tool-prompt';

const keyed = buildToolSystemPrompt({ webSearch: true });
const keyless = buildToolSystemPrompt({ webSearch: false });

describe('buildToolSystemPrompt', () => {
  describe('always', () => {
    for (const tool of [
      'wikipedia',
      'news_feed',
      'fetch_url',
      'profile_search',
      'meeting_availability',
    ]) {
      it(`advertises ${tool}`, () => {
        expect(keyless).toContain(tool);
        expect(keyed).toContain(tool);
      });
    }

    it('keeps the one-tool-per-turn rule', () => {
      expect(keyless).toContain('Only call one tool per turn.');
    });

    it('keeps the rule that the profile is never answered from memory', () => {
      expect(keyless).toContain('never answer those from memory');
    });

    // The retirement guard, now living where the prompt actually is.
    it('never names the retired web_search tool', () => {
      expect(keyless).not.toContain('web_search');
      expect(keyed).not.toContain('web_search');
    });
  });

  describe('without a Tavily key', () => {
    // A tool that can only fail still costs one of eight ReAct iterations, and a model told it
    // can search will sometimes claim it did.
    it('says nothing about searching the web', () => {
      expect(keyless).not.toContain('tavily_search');
      expect(keyless).not.toContain('tavily');
    });
  });

  describe('with a Tavily key', () => {
    // Pins the exact envelope `detectToolCall` parses and `registry.ts` dispatches on: a reworded
    // example that changed this key would break dispatch silently.
    it('advertises the exact call shape', () => {
      expect(keyed).toContain('{"tool":"tavily_search","args":{"query":"<search words>"}}');
    });

    it('shows the optional arguments as complete literals, not placeholders', () => {
      expect(keyed).toContain('"topic":"news"');
      expect(keyed).toContain('"time_range":"day"');
      expect(keyed).toContain('"sites":"arxiv.org,nature.com"');
    });

    // Tavily ranks, it does not read intent, so "latest AI news today" returns whatever matches
    // those words rather than what is most recent.
    it('tells the model to use time_range instead of writing "latest" into the query', () => {
      expect(keyed).toContain('instead of putting words like "latest"');
    });

    it('points at fetch_url for the one result that matters', () => {
      expect(keyed).toContain('call fetch_url on that result');
    });

    it("tells the model not to send the user's own details to a remote search", () => {
      expect(keyed).toContain("Never send the user's own details to tavily_search");
    });

    it('lists tavily_search first, since a small model takes the first plausible entry', () => {
      expect(keyed.indexOf('tavily_search')).toBeLessThan(keyed.indexOf('wikipedia'));
    });
  });
});
