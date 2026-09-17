import { describe, it, expect } from 'vitest';
import { chunkProfile, MAX_CHUNK_CHARS } from '../chunk';

describe('chunkProfile', () => {
  it('makes one chunk per ## heading, in document order', () => {
    const chunks = chunkProfile('## Python\n\nEight years.\n\n## React\n\nSix years.');

    expect(chunks.map((c) => c.heading)).toEqual(['Python', 'React']);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });

  // The heading is both the retrieval key and the citation. Embedding the body alone means
  // "Eight years." scores against "Do you know Python?" on nothing at all.
  it('embeds the heading with the body, not just the body', () => {
    const [chunk] = chunkProfile('## Python and FastAPI\n\nEight years.');

    expect(chunk.text).toBe('## Python and FastAPI\n\nEight years.');
  });

  // `###` is the author subdividing a subject they already named; promoting it would cite a
  // heading whose subject the answer does not actually match.
  it('does not split on ### — only ## starts a new section', () => {
    const chunks = chunkProfile('## Python\n\nText.\n\n### Django\n\nMore text.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('### Django');
  });

  it('keeps prose before the first heading under an Overview heading', () => {
    const chunks = chunkProfile('Juan Almeida, Quito.\n\n## Python\n\nEight years.');

    expect(chunks.map((c) => c.heading)).toEqual(['Overview', 'Python']);
    expect(chunks[0].text).toContain('Juan Almeida, Quito.');
  });

  it('ignores a heading with no body rather than indexing an empty vector', () => {
    const chunks = chunkProfile('## Empty\n\n## Python\n\nEight years.');

    expect(chunks.map((c) => c.heading)).toEqual(['Python']);
  });

  it('gives every chunk a distinct id', () => {
    const chunks = chunkProfile('## Python\n\nA.\n\n## React\n\nB.\n\n## Go\n\nC.');

    expect(new Set(chunks.map((c) => c.id)).size).toBe(3);
  });

  describe('an over-long section', () => {
    const paragraph = `${'word '.repeat(150)}\n`; // ~750 chars
    const long = `## Everything\n\n${paragraph}\n${paragraph}\n${paragraph}`;

    it('splits into parts, each within the chunk cap', () => {
      const chunks = chunkProfile(long);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        // The heading line rides along on top of the body, so the body is what the cap governs.
        expect(chunk.text.length).toBeLessThan(MAX_CHUNK_CHARS + 200);
      }
    });

    it('numbers the parts so a citation says which one it came from', () => {
      const chunks = chunkProfile(long);

      expect(chunks[0].heading).toMatch(/^Everything \(1\/\d\)$/);
      expect(chunks[chunks.length - 1].heading).toMatch(/^Everything \(\d\/\d\)$/);
    });

    // A chunk cut through the middle of a sentence embeds as neither half and reads as
    // gibberish when an answer cites it.
    it('splits on blank lines, never mid-paragraph', () => {
      const chunks = chunkProfile(long);

      for (const chunk of chunks) {
        const body = chunk.text.split('\n\n').slice(1).join('\n\n');
        expect(body.trim().startsWith('word')).toBe(true);
      }
    });

    // A single paragraph over the cap has no blank line to split on. Emitting it whole beats
    // emitting nothing, so the cap yields rather than the content.
    it('keeps one unsplittable paragraph whole rather than dropping it', () => {
      const chunks = chunkProfile(`## Wall\n\n${'x'.repeat(MAX_CHUNK_CHARS * 2)}`);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text.length).toBeGreaterThan(MAX_CHUNK_CHARS);
    });
  });

  it('returns nothing for an empty document', () => {
    expect(chunkProfile('')).toEqual([]);
    expect(chunkProfile('   \n\n  ')).toEqual([]);
  });

  it('handles CRLF the same as LF', () => {
    const chunks = chunkProfile('## Python\r\n\r\nEight years.\r\n\r\n## React\r\n\r\nSix.');

    expect(chunks.map((c) => c.heading)).toEqual(['Python', 'React']);
  });
});
