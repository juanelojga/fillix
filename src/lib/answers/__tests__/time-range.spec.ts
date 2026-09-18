import { describe, it, expect } from 'vitest';
import {
  formatClock,
  formatDuration,
  intersect,
  mergeRanges,
  parseClock,
  parseTimeRange,
  parseWrittenTime,
  totalMinutes,
} from '../time-range';

describe('parseClock', () => {
  it('reads a 24-hour clock time', () => {
    expect(parseClock('09:00')).toBe(540);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(1439);
  });

  it('rejects anything that is not one', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('9')).toBeNull();
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('09:60')).toBeNull();
    expect(parseClock('nine')).toBeNull();
  });
});

describe('formatClock / formatDuration', () => {
  it('pads a clock time', () => {
    expect(formatClock(540)).toBe('09:00');
    expect(formatClock(0)).toBe('00:00');
  });

  it('words a duration the way prose quotes it', () => {
    expect(formatDuration(240)).toBe('4 h');
    expect(formatDuration(90)).toBe('1 h 30 m');
    expect(formatDuration(45)).toBe('45 m');
    expect(formatDuration(0)).toBe('none');
    expect(formatDuration(-10)).toBe('none');
  });
});

describe('parseTimeRange', () => {
  it('reads the 12-hour range a job page renders, with an en dash', () => {
    expect(parseTimeRange('2:00 AM – 3:00 PM')).toEqual([{ start: 120, end: 900 }]);
  });

  // Toptal renders a fullwidth tilde when the client's hours are not firm. Two of eight real
  // captures do this, and refusing them cost the overlap on a quarter of postings.
  it('strips a leading approximately marker and reads the range behind it', () => {
    expect(parseTimeRange('～ 3:00 AM – 11:00 AM')).toEqual([{ start: 180, end: 660 }]);
    expect(parseTimeRange('～ 11:00 AM – 7:00 PM')).toEqual([{ start: 660, end: 1140 }]);
  });

  it('accepts the ASCII and mathematical spellings of that marker too', () => {
    expect(parseTimeRange('~ 9:00 AM – 5:00 PM')).toEqual([{ start: 540, end: 1020 }]);
    expect(parseTimeRange('≈9:00 AM – 5:00 PM')).toEqual([{ start: 540, end: 1020 }]);
  });

  // The marker is only ever a prefix on the whole range. A stray tilde where a time belongs is
  // still unreadable, and must not be silently dropped into a guess.
  it('does not strip a marker from the second half of a range', () => {
    expect(parseTimeRange('9:00 AM – ~5:00 PM')).toBeNull();
  });

  it('accepts a hyphen, an em dash and the word "to"', () => {
    expect(parseTimeRange('9:00 AM - 5:00 PM')).toEqual([{ start: 540, end: 1020 }]);
    expect(parseTimeRange('9:00 AM — 5:00 PM')).toEqual([{ start: 540, end: 1020 }]);
    expect(parseTimeRange('9:00 AM to 5:00 PM')).toEqual([{ start: 540, end: 1020 }]);
  });

  it('accepts bare 24-hour times and an hour with no minutes', () => {
    expect(parseTimeRange('09:00–17:00')).toEqual([{ start: 540, end: 1020 }]);
    expect(parseTimeRange('9 AM – 5 PM')).toEqual([{ start: 540, end: 1020 }]);
  });

  // 12 is the one hour a 12-hour clock maps backwards.
  it('maps 12 AM to midnight and 12 PM to noon', () => {
    expect(parseTimeRange('12:00 AM – 12:00 PM')).toEqual([{ start: 0, end: 720 }]);
    expect(parseTimeRange('12:00 PM – 11:00 PM')).toEqual([{ start: 720, end: 1380 }]);
  });

  // A single wrapped range would intersect nothing, so it comes back as two segments.
  it('splits a range that crosses midnight into two segments of one day', () => {
    expect(parseTimeRange('10:00 PM – 6:00 AM')).toEqual([
      { start: 0, end: 360 },
      { start: 1320, end: 1440 },
    ]);
  });

  it('keeps one segment when the wrapped range ends exactly at midnight', () => {
    expect(parseTimeRange('10:00 PM – 12:00 AM')).toEqual([{ start: 1320, end: 1440 }]);
  });

  it('returns null rather than guessing', () => {
    expect(parseTimeRange('')).toBeNull();
    expect(parseTimeRange('flexible')).toBeNull();
    expect(parseTimeRange('9:00 AM')).toBeNull();
    expect(parseTimeRange('25:00 – 26:00')).toBeNull();
    expect(parseTimeRange('13:00 PM – 14:00 PM')).toBeNull();
    // Equal ends are a zero-length day, which is not a range anyone meant.
    expect(parseTimeRange('9:00 AM – 9:00 AM')).toBeNull();
  });
});

describe('intersect / mergeRanges / totalMinutes', () => {
  it('intersects half-open ranges and rejects a touch at the boundary', () => {
    expect(intersect({ start: 540, end: 780 }, { start: 120, end: 900 })).toEqual({
      start: 540,
      end: 780,
    });
    expect(intersect({ start: 900, end: 1080 }, { start: 120, end: 900 })).toBeNull();
  });

  it('folds overlapping and touching ranges into one', () => {
    expect(
      mergeRanges([
        { start: 660, end: 900 },
        { start: 540, end: 780 },
      ]),
    ).toEqual([{ start: 540, end: 900 }]);
    expect(
      mergeRanges([
        { start: 540, end: 660 },
        { start: 660, end: 780 },
      ]),
    ).toEqual([{ start: 540, end: 780 }]);
  });

  it('leaves genuinely separate ranges apart, in order', () => {
    expect(
      mergeRanges([
        { start: 900, end: 1080 },
        { start: 540, end: 660 },
      ]),
    ).toEqual([
      { start: 540, end: 660 },
      { start: 900, end: 1080 },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [{ start: 540, end: 660 }];
    mergeRanges(input);
    expect(input).toEqual([{ start: 540, end: 660 }]);
  });

  it('sums range lengths', () => {
    expect(
      totalMinutes([
        { start: 540, end: 660 },
        { start: 900, end: 1080 },
      ]),
    ).toBe(300);
    expect(totalMinutes([])).toBe(0);
  });
});

describe('parseWrittenTime', () => {
  it('reports whether the text named a half of the day', () => {
    expect(parseWrittenTime('9')).toEqual({ minutes: 540, hadMeridiem: false });
    expect(parseWrittenTime('9am')).toEqual({ minutes: 540, hadMeridiem: true });
    expect(parseWrittenTime('9 PM')).toEqual({ minutes: 1260, hadMeridiem: true });
    expect(parseWrittenTime('9 p.m.')).toEqual({ minutes: 1260, hadMeridiem: true });
    expect(parseWrittenTime('14:30')).toEqual({ minutes: 870, hadMeridiem: false });
  });

  // `profile/day-hours.ts` is the only caller, and it needs the flag to read `3-6pm`: what a
  // bare hour means is decided by the other end of the range, which is not this module's call.
  it('maps 12 by the meridiem it was given', () => {
    expect(parseWrittenTime('12am')).toEqual({ minutes: 0, hadMeridiem: true });
    expect(parseWrittenTime('12pm')).toEqual({ minutes: 720, hadMeridiem: true });
    expect(parseWrittenTime('12')).toEqual({ minutes: 720, hadMeridiem: false });
  });

  it('rejects an hour a clock does not have', () => {
    expect(parseWrittenTime('25')).toBeNull();
    expect(parseWrittenTime('13pm')).toBeNull();
    expect(parseWrittenTime('9:70')).toBeNull();
    expect(parseWrittenTime('noon')).toBeNull();
  });
});
