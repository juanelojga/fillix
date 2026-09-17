import { describe, it, expect } from 'vitest';
import {
  WEEKDAYS,
  dayRanges,
  defaultAvailability,
  describeRanges,
  hasAnyHours,
  normalizeAvailability,
} from '../availability';

describe('defaultAvailability', () => {
  it('has five empty weekdays and no zone', () => {
    const fresh = defaultAvailability();
    expect(Object.keys(fresh.days)).toEqual(WEEKDAYS);
    expect(Object.values(fresh.days)).toEqual(['', '', '', '', '']);
    expect(fresh.timeZone).toBe('');
    expect(fresh.updatedAt).toBe(0);
  });
});

describe('normalizeAvailability', () => {
  it('fills in a completely absent value', () => {
    expect(normalizeAvailability(undefined)).toEqual(defaultAvailability());
    expect(normalizeAvailability(null)).toEqual(defaultAvailability());
    expect(normalizeAvailability('nonsense')).toEqual(defaultAvailability());
  });

  // Stored verbatim: a day the parser cannot read has to survive a reload so it can be fixed.
  it('keeps the typed text exactly as it was, unreadable or not', () => {
    const stored = normalizeAvailability({ days: { mon: '9am-1pm, 3-6pm', tue: 'mornings' } });
    expect(stored.days.mon).toBe('9am-1pm, 3-6pm');
    expect(stored.days.tue).toBe('mornings');
  });

  it('keeps a string time zone and drops anything else', () => {
    expect(normalizeAvailability({ timeZone: 'America/Guayaquil' }).timeZone).toBe(
      'America/Guayaquil',
    );
    expect(normalizeAvailability({ timeZone: 42 }).timeZone).toBe('');
  });

  // The shape this feature stored before the editor took free text. The hours are the user's,
  // and they are trivially expressible in the new field, so they are converted not dropped.
  it('converts the earlier two-window shape rather than losing the hours', () => {
    const stored = normalizeAvailability({
      days: {
        mon: [
          { enabled: true, start: '09:00', end: '11:00' },
          { enabled: true, start: '15:00', end: '18:00' },
        ],
        tue: [
          { enabled: true, start: '09:00', end: '13:00' },
          { enabled: false, start: '14:00', end: '18:00' },
        ],
        wed: [
          { enabled: false, start: '09:00', end: '13:00' },
          { enabled: false, start: '14:00', end: '18:00' },
        ],
      },
    });
    expect(stored.days.mon).toBe('09:00-11:00, 15:00-18:00');
    expect(stored.days.tue).toBe('09:00-13:00');
    expect(stored.days.wed).toBe('');
    expect(dayRanges(stored, 'mon')).toEqual([
      { start: 540, end: 660 },
      { start: 900, end: 1080 },
    ]);
  });

  it('drops a legacy window missing its times rather than writing "undefined"', () => {
    const stored = normalizeAvailability({ days: { mon: [{ enabled: true }] } });
    expect(stored.days.mon).toBe('');
  });
});

describe('dayRanges', () => {
  it('parses one day’s typed hours into merged minutes', () => {
    const week = defaultAvailability();
    week.days.mon = '9am-1pm, 3-6pm';
    expect(dayRanges(week, 'mon')).toEqual([
      { start: 540, end: 780 },
      { start: 900, end: 1080 },
    ]);
  });

  it('is empty for a blank day and for one it cannot read', () => {
    const week = defaultAvailability();
    week.days.tue = 'mornings';
    expect(dayRanges(week, 'mon')).toEqual([]);
    expect(dayRanges(week, 'tue')).toEqual([]);
  });
});

describe('describeRanges', () => {
  // "and" rather than a comma: a comma reads as a list the model may reformat or extend.
  it('joins two ranges with "and"', () => {
    expect(
      describeRanges([
        { start: 540, end: 660 },
        { start: 900, end: 1080 },
      ]),
    ).toBe('09:00–11:00 and 15:00–18:00');
  });

  it('is empty for no ranges', () => {
    expect(describeRanges([])).toBe('');
  });
});

describe('hasAnyHours', () => {
  it('is false for an untouched week', () => {
    expect(hasAnyHours(defaultAvailability())).toBe(false);
  });

  it('is true as soon as one day reads', () => {
    const week = defaultAvailability();
    week.days.thu = '2pm-6pm';
    expect(hasAnyHours(week)).toBe(true);
  });

  // Text nobody can parse is not availability, however much of it there is.
  it('is false when every day is typed but unreadable', () => {
    const week = defaultAvailability();
    week.days.fri = 'whenever really';
    expect(hasAnyHours(week)).toBe(false);
  });
});
