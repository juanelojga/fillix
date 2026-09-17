import { describe, it, expect } from 'vitest';
import {
  formatOffset,
  instantOf,
  nextDay,
  parseFixedOffset,
  resolveZone,
  wallClockIn,
  zoneOffsetAt,
} from '../zone-offset';

const SEPTEMBER = new Date('2026-09-21T12:00:00Z');
const JANUARY = new Date('2026-01-15T12:00:00Z');

describe('parseFixedOffset', () => {
  it('reads every shape a form writes an offset in', () => {
    expect(parseFixedOffset('GMT+02:00')).toBe(120);
    expect(parseFixedOffset('UTC-5')).toBe(-300);
    expect(parseFixedOffset('+02:00')).toBe(120);
    expect(parseFixedOffset('-0530')).toBe(-330);
    expect(parseFixedOffset('  gmt +01:00 ')).toBe(60);
  });

  it('reads the zero offset written as a word', () => {
    expect(parseFixedOffset('UTC')).toBe(0);
    expect(parseFixedOffset('GMT')).toBe(0);
    expect(parseFixedOffset('Z')).toBe(0);
  });

  it('refuses anything that is not an offset, rather than defaulting to zero', () => {
    expect(parseFixedOffset('Madrid')).toBeNull();
    expect(parseFixedOffset('Europe/Madrid')).toBeNull();
    expect(parseFixedOffset('')).toBeNull();
    // Past the largest real offset — Pacific/Kiritimati at +14:00.
    expect(parseFixedOffset('GMT+15:00')).toBeNull();
  });
});

describe('formatOffset', () => {
  it('always prints a sign, because GMT2 reads as ambiguous', () => {
    expect(formatOffset(120)).toBe('GMT+02:00');
    expect(formatOffset(-300)).toBe('GMT-05:00');
    expect(formatOffset(0)).toBe('GMT+00:00');
    expect(formatOffset(330)).toBe('GMT+05:30');
  });
});

describe('zoneOffsetAt', () => {
  // The whole reason this is asked of Intl per instant rather than cached once.
  it('gives a zone its summer and winter offsets', () => {
    expect(zoneOffsetAt('Europe/Madrid', SEPTEMBER)).toBe(120);
    expect(zoneOffsetAt('Europe/Madrid', JANUARY)).toBe(60);
  });

  it('handles a zone that does not observe DST', () => {
    expect(zoneOffsetAt('America/Guayaquil', SEPTEMBER)).toBe(-300);
    expect(zoneOffsetAt('America/Guayaquil', JANUARY)).toBe(-300);
  });

  it('reads a half-hour zone', () => {
    expect(zoneOffsetAt('Asia/Kolkata', SEPTEMBER)).toBe(330);
  });

  it('returns null for a zone this browser does not know', () => {
    expect(zoneOffsetAt('Middle/Earth', SEPTEMBER)).toBeNull();
  });
});

describe('resolveZone', () => {
  it('takes a written offset as written, without re-deriving a DST opinion', () => {
    expect(resolveZone('GMT+02:00', JANUARY)).toEqual({ offsetMinutes: 120, label: 'GMT+02:00' });
  });

  it('resolves a place name at the instant asked about', () => {
    expect(resolveZone('Europe/Madrid', SEPTEMBER)).toEqual({
      offsetMinutes: 120,
      label: 'Europe/Madrid',
    });
    expect(resolveZone('Europe/Madrid', JANUARY)).toEqual({
      offsetMinutes: 60,
      label: 'Europe/Madrid',
    });
  });

  it('refuses an unknown zone and an empty one rather than falling back to UTC', () => {
    expect(resolveZone('CEST', SEPTEMBER)).toBeNull();
    expect(resolveZone('', SEPTEMBER)).toBeNull();
    expect(resolveZone('   ', SEPTEMBER)).toBeNull();
  });
});

describe('instantOf and wallClockIn', () => {
  const date = { year: 2026, month: 9, day: 21 };

  it('converts a wall clock in one zone to a wall clock in another', () => {
    // 17:00 in GMT+02:00 is 10:00 the same day in Guayaquil.
    const instant = instantOf(date, 17 * 60, 120);
    expect(wallClockIn('America/Guayaquil', instant)).toEqual({
      year: 2026,
      month: 9,
      day: 21,
      minutes: 10 * 60,
      weekday: 1,
    });
  });

  // The failure that offset subtraction cannot express, and the reason for the split in
  // `schedule-check.ts`: the converted time is on a different calendar day than the one asked.
  it('lands on the previous local day when the offsets are far enough apart', () => {
    const instant = instantOf(date, 9 * 60, 9 * 60); // 09:00 in GMT+09:00
    const local = wallClockIn('America/Guayaquil', instant);
    expect(local).toEqual({ year: 2026, month: 9, day: 20, minutes: 19 * 60, weekday: 0 });
  });

  it('reads local midnight as 00:00 and not as 24:00', () => {
    const instant = instantOf(date, 5 * 60, 0); // 05:00 UTC
    expect(wallClockIn('America/Guayaquil', instant)?.minutes).toBe(0);
  });

  it('returns null for a zone it cannot use, rather than a wrong reading', () => {
    expect(wallClockIn('Middle/Earth', SEPTEMBER)).toBeNull();
  });
});

describe('nextDay', () => {
  it('rolls over months and leap years through Date rather than by hand', () => {
    expect(nextDay({ year: 2026, month: 9, day: 30 })).toEqual({ year: 2026, month: 10, day: 1 });
    expect(nextDay({ year: 2026, month: 12, day: 31 })).toEqual({ year: 2027, month: 1, day: 1 });
    expect(nextDay({ year: 2028, month: 2, day: 28 })).toEqual({ year: 2028, month: 2, day: 29 });
  });
});
