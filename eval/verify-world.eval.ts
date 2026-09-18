import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  normalizeAvailability,
  dayRanges,
  describeRanges,
  WEEKDAYS,
} from '../src/lib/profile/availability';
import { chunkProfile } from '../src/lib/profile/chunk';
import { findPii } from './scrub/pii-patterns.ts';

const DIR = path.resolve('eval/profile');
const read = (f: string) => readFileSync(path.join(DIR, f), 'utf8');

describe('the frozen world', () => {
  it('parses the availability exactly as the panel echoed it back', () => {
    const a = normalizeAvailability(JSON.parse(read('availability.json')));
    expect(a.timeZone).toBe('America/Guayaquil');
    for (const day of WEEKDAYS) {
      expect(describeRanges(dayRanges(a, day))).toBe('08:00–09:00 and 11:00–17:00');
    }
  });

  it('chunks the profile into the section count the panel reported', () => {
    const chunks = chunkProfile(read('profile.md'));
    console.log(`  ${chunks.length} chunks from ${read('profile.md').length} chars`);
    console.log(
      `  headings: ${[...new Set(chunks.map((c) => c.heading.replace(/ \(\d+\/\d+\)$/, '')))].length} distinct`,
    );
    expect(chunks.length).toBe(31);
  });

  it('reports what still needs scrubbing', () => {
    const hits = findPii(read('profile.md'));
    console.log(
      `  generic PII still present: ${hits.map((h) => `${h.name}×${h.hits}`).join(', ') || 'none'}`,
    );
    expect(Array.isArray(hits)).toBe(true);
  });
});
