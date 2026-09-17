import { describe, it, expect } from 'vitest';
import { parseDayHours } from '../day-hours';

/** `[[start, end], …]` in minutes, which reads far better than a wall of objects. */
const at = (text: string) => parseDayHours(text).ranges.map((r) => [r.start, r.end]);
const unreadable = (text: string) => parseDayHours(text).unreadable;

describe('parseDayHours — explicit input', () => {
  it('reads an AM/PM range', () => {
    expect(at('9am-1pm')).toEqual([[540, 780]]);
    expect(at('9:30 AM - 1:15 PM')).toEqual([[570, 795]]);
    expect(at('9 a.m. to 1 p.m.')).toEqual([[540, 780]]);
  });

  it('reads a 24-hour range, with any of the dashes', () => {
    expect(at('09:00-13:00')).toEqual([[540, 780]]);
    expect(at('09:00–13:00')).toEqual([[540, 780]]);
    expect(at('09:00—13:00')).toEqual([[540, 780]]);
    expect(at('14:00 until 18:00')).toEqual([[840, 1080]]);
    expect(at('14:00 till 18:00')).toEqual([[840, 1080]]);
  });
});

describe('parseDayHours — the two conventions', () => {
  // Read literally this is 03:00–18:00, a fifteen-hour day nobody typed.
  it('lets a named half-day govern the bare end: 3-6pm is an afternoon', () => {
    expect(at('3-6pm')).toEqual([[900, 1080]]);
    expect(at('3 to 6 pm')).toEqual([[900, 1080]]);
  });

  it('lets a named start govern the bare end: 9am-1 is a working day', () => {
    expect(at('9am-1')).toEqual([[540, 780]]);
  });

  // `9-1` overnight would be an eleven-hour meeting starting at bedtime.
  it('reads a bare end earlier than the start as the same afternoon', () => {
    expect(at('9-1')).toEqual([[540, 780]]);
    expect(at('10-6')).toEqual([[600, 1080]]);
    expect(at('9-5')).toEqual([[540, 1020]]);
  });

  it('does not shift when doing so would not order the range', () => {
    // 9 cannot become 21:00 and stay before 13:00.
    expect(at('9-1pm')).toEqual([[540, 780]]);
  });

  it('still wraps past midnight when the shift is impossible', () => {
    // 22 has no afternoon to move to, so this is a genuine overnight window.
    expect(at('22-6')).toEqual([
      [0, 360],
      [1320, 1440],
    ]);
  });

  it('still wraps past midnight when both ends are explicit', () => {
    expect(at('10pm-6am')).toEqual([
      [0, 360],
      [1320, 1440],
    ]);
  });

  // The documented limit, and the reason the editor echoes its reading back under the field.
  it('does not invent an afternoon for two bare in-order hours', () => {
    expect(at('1-5')).toEqual([[60, 300]]);
    expect(at('1pm-5pm')).toEqual([[780, 1020]]);
  });
});

describe('parseDayHours — several ranges', () => {
  it('reads a comma-separated list', () => {
    expect(at('9am-1pm, 3-6pm')).toEqual([
      [540, 780],
      [900, 1080],
    ]);
  });

  it('accepts "and", a semicolon, a slash and a newline as separators', () => {
    const expected = [
      [540, 660],
      [900, 1080],
    ];
    expect(at('9-11 and 3-6pm')).toEqual(expected);
    expect(at('9-11; 3-6pm')).toEqual(expected);
    expect(at('9-11 / 3-6pm')).toEqual(expected);
    expect(at('9-11\n3-6pm')).toEqual(expected);
  });

  it('orders the ranges however they were typed', () => {
    expect(at('3-6pm, 9-11')).toEqual([
      [540, 660],
      [900, 1080],
    ]);
  });

  // Counting the shared hours twice would overstate the week to a recruiter.
  it('merges overlapping ranges rather than double-counting them', () => {
    expect(at('9-1, 11am-3pm')).toEqual([[540, 900]]);
    expect(at('9-11, 11am-1pm')).toEqual([[540, 780]]);
  });
});

describe('parseDayHours — nothing, and what it cannot read', () => {
  it('treats an empty field as a day off, with no complaint', () => {
    expect(parseDayHours('')).toEqual({ ranges: [], unreadable: [] });
    expect(parseDayHours('   ')).toEqual({ ranges: [], unreadable: [] });
  });

  it('accepts the common ways of writing "nothing" without reporting a mistake', () => {
    for (const word of ['none', 'No', 'n/a', 'NA', 'off', 'unavailable', 'nothing']) {
      expect(parseDayHours(word)).toEqual({ ranges: [], unreadable: [] });
    }
  });

  // Never a silent guess: the editor prints these back under the field.
  it('reports a fragment it cannot read, exactly as typed', () => {
    expect(unreadable('mornings')).toEqual(['mornings']);
    expect(at('mornings')).toEqual([]);
    expect(unreadable('25-30')).toEqual(['25-30']);
    expect(unreadable('9:70-10:00')).toEqual(['9:70-10:00']);
  });

  it('keeps the ranges it could read and names only the fragment it could not', () => {
    const parsed = parseDayHours('9am-1pm, whenever');
    expect(parsed.ranges.map((r) => [r.start, r.end])).toEqual([[540, 780]]);
    expect(parsed.unreadable).toEqual(['whenever']);
  });

  it('rejects a zero-length range rather than emitting an empty window', () => {
    expect(unreadable('9-9')).toEqual(['9-9']);
  });

  it('rejects a fragment that is not a range at all', () => {
    expect(unreadable('9am')).toEqual(['9am']);
    expect(unreadable('9-1-5')).toEqual(['9-1-5']);
  });
});
