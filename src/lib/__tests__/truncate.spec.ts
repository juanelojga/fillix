// TODO: Install test runner with: pnpm add -D vitest @vitest/ui jsdom @vitest/browser
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import { truncateDocument } from '../obsidian';

describe('truncateDocument', () => {
  it('returns content unchanged when length <= 8000', () => {
    const content = 'x'.repeat(8000);
    expect(truncateDocument(content)).toBe(content);
  });

  it('truncates content to 8000 chars when length > 8000', () => {
    const content = 'x'.repeat(9000);
    const result = truncateDocument(content);
    expect(result.startsWith('x'.repeat(8000))).toBe(true);
  });

  it('appends truncation notice when content is truncated', () => {
    const content = 'x'.repeat(9000);
    const result = truncateDocument(content);
    expect(result).toContain('[Document truncated at 8000 characters]');
  });

  it('total length after truncation is 8000 + notice length', () => {
    const notice = '\n\n[Document truncated at 8000 characters]';
    const content = 'x'.repeat(9000);
    const result = truncateDocument(content);
    expect(result.length).toBe(8000 + notice.length);
  });

  it('does not append truncation notice when content is exactly 8000 chars', () => {
    const content = 'x'.repeat(8000);
    const result = truncateDocument(content);
    expect(result).not.toContain('[Document truncated');
  });

  it('handles empty string without error', () => {
    expect(truncateDocument('')).toBe('');
  });

  it('handles short content without modification', () => {
    expect(truncateDocument('hello')).toBe('hello');
  });
});
