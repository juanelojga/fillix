// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';

// DOMPurify requires a real DOM environment — mock it to return input unchanged in tests,
// since we're testing marked output shape, not DOMPurify internals.
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
}));

import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fenced code blocks as <pre><code>', () => {
    const result = renderMarkdown('```python\nprint("hi")\n```');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code');
    expect(result).toContain('print(&quot;hi&quot;)');
  });

  it('renders inline code as <code>', () => {
    const result = renderMarkdown('Use `Array.prototype.flat()` here.');
    expect(result).toContain('<code>');
    expect(result).toContain('Array.prototype.flat()');
  });

  it('renders ordered lists as <ol><li>', () => {
    const result = renderMarkdown('1. First\n2. Second\n3. Third');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>');
    expect(result).toContain('First');
    expect(result).toContain('Second');
  });

  it('renders unordered lists as <ul><li>', () => {
    const result = renderMarkdown('- React\n- Vue\n- Svelte');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('React');
  });

  it('renders bold text as <strong>', () => {
    const result = renderMarkdown('This is **important**.');
    expect(result).toContain('<strong>');
    expect(result).toContain('important');
  });

  it('renders paragraph text as <p>', () => {
    const result = renderMarkdown('A simple paragraph.');
    expect(result).toContain('<p>');
    expect(result).toContain('A simple paragraph.');
  });

  it('passes rendered HTML through DOMPurify.sanitize', async () => {
    const DOMPurify = (await import('dompurify')).default;
    renderMarkdown('hello');
    expect(DOMPurify.sanitize).toHaveBeenCalledOnce();
  });

  it('returns the sanitized string from DOMPurify', async () => {
    const DOMPurify = (await import('dompurify')).default;
    (DOMPurify.sanitize as ReturnType<typeof vi.fn>).mockReturnValue('<p>safe</p>');
    const result = renderMarkdown('hello');
    expect(result).toBe('<p>safe</p>');
  });

  it('returns a string (not a Promise)', () => {
    const result = renderMarkdown('test');
    expect(typeof result).toBe('string');
  });
});
