// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import { sanitizeError } from '../background';

// ─── Task 5.2: sanitizeError — API key redaction ─────────────────────────────

describe('sanitizeError', () => {
  it('replaces a single occurrence of the API key with [REDACTED]', () => {
    expect(sanitizeError('Bearer abc123 returned 404', 'abc123')).toBe(
      'Bearer [REDACTED] returned 404',
    );
  });

  it('replaces all occurrences of the API key when it appears multiple times', () => {
    expect(sanitizeError('key=abc123 auth=abc123', 'abc123')).toBe(
      'key=[REDACTED] auth=[REDACTED]',
    );
  });

  it('returns the error unchanged when the API key does not appear in the message', () => {
    expect(sanitizeError('Obsidian API returned 404', 'abc123')).toBe('Obsidian API returned 404');
  });

  it('returns the error unchanged when apiKey is an empty string', () => {
    expect(sanitizeError('some error message', '')).toBe('some error message');
  });

  it('handles an error string that IS the API key', () => {
    expect(sanitizeError('abc123', 'abc123')).toBe('[REDACTED]');
  });

  it('handles an empty error string', () => {
    expect(sanitizeError('', 'abc123')).toBe('');
  });

  it('does not alter unrelated parts of the error message', () => {
    const result = sanitizeError('host=localhost key=abc123 status=403', 'abc123');
    expect(result).toContain('host=localhost');
    expect(result).toContain('status=403');
    expect(result).not.toContain('abc123');
  });
});
