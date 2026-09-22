import { describe, it, expect } from 'vitest';
import type { NewsItem } from '../../../types';
import type { SearchResult } from '../../tavily/search';
import { RESEARCH_CHARS } from '../post-budget';
import { RESEARCH_SNIPPET_CHARS, buildResearchEvidence } from '../research-evidence';

function web(n: number, body = 'A web snippet.'): SearchResult {
  return {
    title: `Web ${n}`,
    url: `https://example.com/${n}`,
    content: body,
    publishedDate: '2026-09-14T00:00:00Z',
  };
}

function hn(n: number, body = 'An HN snippet.'): NewsItem {
  return {
    id: `hn:${n}`,
    category: 'technology',
    title: `HN ${n}`,
    url: `https://news.ycombinator.com/item?id=${n}`,
    source: 'Hacker News',
    meta: '412 points',
    publishedAt: '2026-09-13T00:00:00Z',
    snippet: body,
  };
}

describe('buildResearchEvidence', () => {
  it('alternates the two sources so neither is silently cut', () => {
    const { sources } = buildResearchEvidence([web(1), web(2)], [hn(1), hn(2)]);
    expect(sources.map((s) => s.origin)).toEqual(['web', 'hn', 'web', 'hn']);
  });

  it('numbers sources from 1, which is what the spike cites', () => {
    const { sources, evidence } = buildResearchEvidence([web(1)], [hn(1)]);
    expect(sources.map((s) => s.n)).toEqual([1, 2]);
    expect(evidence).toContain('[1] web · Web 1');
    expect(evidence).toContain('[2] hn · HN 1');
  });

  it('keeps every block whole — three lines, so [n] always has a URL under it', () => {
    const { evidence, sources } = buildResearchEvidence([web(1)], []);
    const lines = evidence.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(`${sources[0].url} · 2026-09-14`);
  });

  it('runs on with just one source when the other is empty', () => {
    const { sources } = buildResearchEvidence([], [hn(1), hn(2)]);
    expect(sources).toHaveLength(2);
  });

  it('returns an empty block rather than throwing when nothing was found', () => {
    expect(buildResearchEvidence([], [])).toEqual({ evidence: '', sources: [] });
  });

  /**
   * A newline in a title would split one block into two, and the second half would be read as
   * a source with no number.
   */
  it('flattens whitespace in titles and snippets', () => {
    const messy = { ...web(1), title: 'Two\nlines', content: 'a\n\nb' };
    const { evidence } = buildResearchEvidence([messy], []);
    expect(evidence).toContain('[1] web · Two lines');
    expect(evidence.split('\n')).toHaveLength(3);
  });

  it('clips a long snippet rather than a long block', () => {
    const { evidence } = buildResearchEvidence([web(1, 'x'.repeat(900))], []);
    const snippet = evidence.split('\n')[2];
    expect(snippet.length).toBeLessThanOrEqual(RESEARCH_SNIPPET_CHARS + 1);
    expect(snippet.endsWith('…')).toBe(true);
  });

  /**
   * Whole blocks are dropped, never part of one: half a block loses the URL line and leaves
   * the number pointing at nothing. `tavily/search-results.ts` learned this the hard way.
   */
  it('drops whole blocks to fit the budget', () => {
    const many = Array.from({ length: 40 }, (_, i) => web(i, 'y'.repeat(300)));
    const { evidence, sources } = buildResearchEvidence(many, []);
    expect(evidence.length).toBeLessThanOrEqual(RESEARCH_CHARS);
    for (const source of sources) {
      expect(evidence).toContain(`[${source.n}] `);
      expect(evidence).toContain(source.url);
    }
  });

  /** No research at all is the one outcome that makes the model write from its training. */
  it('keeps the first block even when it alone overflows', () => {
    const huge = { ...web(1), content: 'z'.repeat(RESEARCH_CHARS * 2) };
    const { sources } = buildResearchEvidence([huge], []);
    expect(sources).toHaveLength(1);
  });

  /** A date the model cannot read is worse than no date — it has no clock to check it with. */
  it('drops an unparseable date rather than passing it through', () => {
    const undated = { ...web(1), publishedDate: 'sometime last week' };
    const { evidence, sources } = buildResearchEvidence([undated], []);
    expect(sources[0].date).toBe('');
    expect(evidence).not.toContain('sometime last week');
    expect(evidence.split('\n')[1]).toBe('https://example.com/1');
  });
});
