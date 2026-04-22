import { describe, it, expect } from 'vitest';
import { cn } from '../components/utils';

describe('cn utility', () => {
  it('combines multiple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('ignores falsy values', () => {
    expect(cn('base', false as unknown as string, undefined, '')).toBe('base');
  });

  it('resolves Tailwind conflicts — last wins', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('handles conditional class objects', () => {
    expect(cn('base', { active: true, inactive: false })).toBe('base active');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('returns empty string when no truthy args', () => {
    expect(cn(false as unknown as string, undefined, '')).toBe('');
  });
});
