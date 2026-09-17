import { describe, it, expect } from 'vitest';
import { extractJobAttributes } from '../toptal-job-attributes';

/** As `readable-text.ts` flattens the grid: one line per cell, label then value. */
const GRID = [
  'Specialization:',
  'Core',
  'Commitment:',
  'Full-time (40 hrs/wk)',
  'Work Setup:',
  'Remote',
  "Client's Hours:",
  '2:00 AM – 3:00 PM',
  'Workday Overlap:',
  '7 hrs (4 hrs required)',
  'Time Zone:',
  'Madrid, 7 hrs ahead',
  'Est. Length:',
  '12+ months',
  'Languages:',
  'English',
  'Job Posted:',
  '6 hours ago',
  'Desired Start Date:',
  'Sep 30, 2026',
].join('\n');

describe('extractJobAttributes', () => {
  it('pairs every label with the value beneath it', () => {
    const attributes = extractJobAttributes(GRID);

    expect(attributes['Commitment']).toBe('Full-time (40 hrs/wk)');
    expect(attributes['Time Zone']).toBe('Madrid, 7 hrs ahead');
    expect(attributes['Desired Start Date']).toBe('Sep 30, 2026');
    expect(Object.keys(attributes)).toHaveLength(10);
  });

  // The check is on the *end* of the line, never on "contains a colon": "Client's Hours:" is a
  // label and "2:00 AM – 3:00 PM" is a value, and both contain one.
  it('does not mistake a time of day for a label', () => {
    const attributes = extractJobAttributes(GRID);

    expect(attributes["Client's Hours"]).toBe('2:00 AM – 3:00 PM');
    expect(attributes['2']).toBeUndefined();
  });

  it('keeps the labels in the order the page listed them', () => {
    expect(Object.keys(extractJobAttributes(GRID))[0]).toBe('Specialization');
  });

  // Recording it as '' would put a blank row on screen and an empty fact in the prompt.
  // Saying nothing is what we actually know.
  it('skips a label Toptal rendered with no value', () => {
    const attributes = extractJobAttributes('Commitment:\nWork Setup:\nRemote');

    expect(attributes).toEqual({ 'Work Setup': 'Remote' });
  });

  it('skips a trailing label with nothing after it at all', () => {
    expect(extractJobAttributes('Work Setup:\nRemote\nLanguages:')).toEqual({
      'Work Setup': 'Remote',
    });
  });

  it('ignores prose that is not part of the grid', () => {
    expect(extractJobAttributes('Some heading\nCommitment:\nFull-time')).toEqual({
      Commitment: 'Full-time',
    });
  });

  it('returns nothing for a section that was not found', () => {
    expect(extractJobAttributes('')).toEqual({});
  });
});
