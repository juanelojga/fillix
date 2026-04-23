import { describe, expect, it } from 'vitest';
import { buildFieldFills, normalizeDraft, normalizeReview } from '../field-normalizer';
import type { FieldSnapshot, ReviewOutput } from '../../types';

const snap = (id: string, label: string): FieldSnapshot => ({
  id,
  name: id,
  label,
  type: 'text',
  currentValue: '',
});

describe('normalizeReview', () => {
  it('passes through clean field-keyed output', () => {
    const raw: ReviewOutput = {
      name: { revised_value: 'Juan Almeida' },
      email: { revised_value: 'j@example.com', change_reason: 'normalised domain' },
    };
    expect(normalizeReview(raw)).toEqual(raw);
  });

  it('unwraps the {analysis, review: {fieldId: {...}}} wrapper pattern', () => {
    const raw = {
      analysis: 'Reviewing each field...',
      issues: 'Field 1 has wrong timezone.',
      recommendations: 'Fix timezone.',
      review: {
        name: { revised_value: 'Juan Almeida', change_reason: null },
        email: { revised_value: 'j@example.com' },
      },
    } as unknown as ReviewOutput;

    const result = normalizeReview(raw);
    expect(result).toEqual({
      name: { revised_value: 'Juan Almeida', change_reason: null },
      email: { revised_value: 'j@example.com' },
    });
    expect('analysis' in result).toBe(false);
    expect('issues' in result).toBe(false);
    expect('review' in result).toBe(false);
  });

  it('returns empty object when review key contains a string (fully malformed)', () => {
    const raw = {
      analysis: 'Reviewing...',
      review: 'Let me check each value against the requirements.',
    } as unknown as ReviewOutput;

    const result = normalizeReview(raw);
    expect(result).toEqual({});
  });

  it('handles the {field_id, revised_value} shorthand', () => {
    const raw = {
      field_id: 'name',
      revised_value: 'Juan',
      change_reason: 'shortened',
    } as unknown as ReviewOutput;

    expect(normalizeReview(raw)).toEqual({
      name: { revised_value: 'Juan', change_reason: 'shortened' },
    });
  });

  it('strips meta keys from flat output', () => {
    const raw = {
      name: { revised_value: 'Juan' },
      analysis: 'some analysis',
      recommendations: 'some recs',
    } as unknown as ReviewOutput;

    const result = normalizeReview(raw);
    expect(result).toEqual({ name: { revised_value: 'Juan' } });
  });
});

describe('normalizeDraft', () => {
  it('passes through clean field-keyed string output', () => {
    const raw = { name: 'Juan', email: 'j@example.com' };
    expect(normalizeDraft(raw)).toEqual(raw);
  });

  it('strips meta keys', () => {
    const raw = { name: 'Juan', notes: 'some notes', analysis: 'thinking...' };
    expect(normalizeDraft(raw)).toEqual({ name: 'Juan' });
  });
});

describe('buildFieldFills', () => {
  const fields = [snap('name', 'Full Name'), snap('email', 'Email')];

  it('produces fills from clean review output', () => {
    const output: ReviewOutput = {
      name: { revised_value: 'Juan Almeida' },
      email: { revised_value: 'j@example.com' },
    };
    const fills = buildFieldFills(output, true, fields);
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ fieldId: 'name', proposedValue: 'Juan Almeida' });
  });

  it('returns empty array when no field IDs match snapshot', () => {
    const output: ReviewOutput = {
      review: { revised_value: 'some text' } as unknown as { revised_value: string },
    };
    const fills = buildFieldFills(output, true, fields);
    expect(fills).toHaveLength(0);
  });

  it('filters out fills with empty proposedValue', () => {
    const output: ReviewOutput = {
      name: { revised_value: '' },
      email: { revised_value: 'j@example.com' },
    };
    const fills = buildFieldFills(output, true, fields);
    expect(fills).toHaveLength(1);
    expect(fills[0].fieldId).toBe('email');
  });
});
