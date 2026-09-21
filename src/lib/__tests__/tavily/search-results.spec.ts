import { describe, it, expect } from 'vitest';
import type { SearchResult } from '../../tavily/search';
import {
  SNIPPET_CHARS,
  TAVILY_RESULT_CHARS,
  formatSearchResults,
} from '../../tavily/search-results';

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  title: 'Svelte 5 is alive',
  url: 'https://svelte.dev/blog/svelte-5-is-alive',
  content: 'Runes are a new reactivity system built on signals.',
  publishedDate: '',
  ...over,
});

/**
 * The block shape is a contract with `ToolCallBlock.svelte`'s `parseSearch`, which cannot be
 * imported because it lives inside a `.svelte` file. These assertions stand in for it: a change
 * here that breaks them is a change that would render the panel wrong.
 */
describe('formatSearchResults', () => {
  it('emits a numbered title, the URL on its own line, then the snippet', () => {
    expect(formatSearchResults([result()])).toBe(
      '1. Svelte 5 is alive\n' +
        'https://svelte.dev/blog/svelte-5-is-alive\n' +
        'Runes are a new reactivity system built on signals.',
    );
  });

  it('separates results by a blank line', () => {
    const text = formatSearchResults([result(), result({ title: 'Second' })]);
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).toContain('2. Second');
  });

  it('appends a published date to the URL line', () => {
    expect(formatSearchResults([result({ publishedDate: '2026-09-14' })])).toContain(
      'https://svelte.dev/blog/svelte-5-is-alive · 2026-09-14',
    );
  });

  // The whole reason this format is not news_feed's one-liner.
  it('keeps a title containing an em dash intact', () => {
    const text = formatSearchResults([result({ title: 'Vue 3 — the Composition API guide' })]);
    expect(text.split('\n')[0]).toBe('1. Vue 3 — the Composition API guide');
  });

  it('survives a URL containing parentheses', () => {
    const url = 'https://en.wikipedia.org/wiki/Mercury_(planet)';
    expect(formatSearchResults([result({ url })]).split('\n')[1]).toBe(url);
  });

  // A newline inside either field would turn one result into two blocks and shift every block
  // after it, since the parser reads position within a block.
  it('flattens newlines out of the title and the snippet', () => {
    const text = formatSearchResults([result({ title: 'a\nb', content: 'c\n\nd' })]);
    expect(text).toBe('1. a b\nhttps://svelte.dev/blog/svelte-5-is-alive\nc d');
  });

  describe('snippet cap', () => {
    it('clips at a word boundary and marks it', () => {
      const snippet = formatSearchResults([result({ content: 'word '.repeat(200) })]).split(
        '\n',
      )[2];
      expect(snippet.length).toBeLessThanOrEqual(SNIPPET_CHARS + 1);
      expect(snippet.endsWith('…')).toBe(true);
      expect(snippet).not.toContain(' …');
    });

    it('leaves a short snippet untouched', () => {
      expect(formatSearchResults([result({ content: 'Short.' })])).toContain('\nShort.');
    });

    it('clips a single unbroken run rather than returning it whole', () => {
      const snippet = formatSearchResults([result({ content: 'x'.repeat(900) })]).split('\n')[2];
      expect(snippet).toHaveLength(SNIPPET_CHARS + 1);
    });
  });

  describe('total budget', () => {
    const fat = (i: number) => result({ title: `Result ${i}`, content: 'y'.repeat(900) });

    it('stays under the ceiling', () => {
      const text = formatSearchResults([1, 2, 3, 4, 5].map(fat));
      expect(text.length).toBeLessThanOrEqual(TAVILY_RESULT_CHARS);
    });

    // A cut block loses the line the parser needs, so the panel would show fewer results than
    // the model was reasoning about.
    it('drops whole blocks, leaving every one still parseable', () => {
      const text = formatSearchResults([1, 2, 3, 4, 5].map(fat));
      for (const block of text.split('\n\n')) {
        const lines = block.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toMatch(/^\d+\. /);
        expect(lines[1]).toMatch(/^https:\/\//);
      }
    });

    // retrieve.ts's rule about its best chunk: nothing at all would make the model answer from
    // thin air, and the caller could not tell that from a web with no answer. Titles are not
    // clipped, so this is the one field that can carry a block past the ceiling on its own.
    it('keeps the first result even when it alone exceeds the budget', () => {
      const text = formatSearchResults([result({ title: 'T'.repeat(5_000) }), result()]);
      expect(text.length).toBeGreaterThan(TAVILY_RESULT_CHARS);
      expect(text.split('\n\n')).toHaveLength(1);
      expect(text.startsWith('1. TTT')).toBe(true);
    });
  });

  it('returns empty for no results, which the tool words as prose rather than an error', () => {
    expect(formatSearchResults([])).toBe('');
  });
});
