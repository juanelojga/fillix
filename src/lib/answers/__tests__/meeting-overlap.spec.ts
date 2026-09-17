import { describe, it, expect } from 'vitest';
import { computeMeetingOverlap } from '../meeting-overlap';
import { parseTimeRange } from '../time-range';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';

/** The worked example: a split Monday and Wednesday, one range Tuesday, late Thursday. */
function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.days.mon = '9-11, 3-6pm';
  availability.days.tue = '9-1';
  availability.days.wed = '9-11, 3-6pm';
  availability.days.thu = '2pm-6pm';
  return availability;
}

const CLIENT_HOURS = parseTimeRange('2:00 AM – 3:00 PM')!;

describe('computeMeetingOverlap', () => {
  it('intersects each weekday against the client range', () => {
    const overlap = computeMeetingOverlap(sampleWeek(), CLIENT_HOURS);
    expect(overlap.days.map((d) => [d.day, d.minutes])).toEqual([
      ['mon', 120],
      ['tue', 240],
      ['wed', 120],
      ['thu', 60],
      ['fri', 0],
    ]);
  });

  it('totals the week and reports the median of the overlapping days', () => {
    const overlap = computeMeetingOverlap(sampleWeek(), CLIENT_HOURS);
    expect(overlap.totalMinutes).toBe(540);
    // [60, 120, 120, 240] → the two middle values are both 120.
    expect(overlap.typicalMinutes).toBe(120);
  });

  // Monday's afternoon window starts exactly where the client's day ends, so it contributes
  // nothing — the ranges are half-open and a boundary touch is not an overlap.
  it('excludes a window that only touches the end of the client range', () => {
    const monday = computeMeetingOverlap(sampleWeek(), CLIENT_HOURS).days[0];
    expect(monday.windows).toEqual([{ start: 540, end: 660 }]);
  });

  it('returns two windows when both of a day’s ranges overlap', () => {
    const availability = defaultAvailability();
    availability.days.mon = '9-10, 12-1pm';
    const monday = computeMeetingOverlap(availability, CLIENT_HOURS).days[0];
    expect(monday.windows).toEqual([
      { start: 540, end: 600 },
      { start: 720, end: 780 },
    ]);
    expect(monday.minutes).toBe(120);
  });

  it('clips a window that runs past the client range', () => {
    const availability = defaultAvailability();
    availability.days.tue = '13:00-20:00';
    const tuesday = computeMeetingOverlap(availability, CLIENT_HOURS).days[1];
    expect(tuesday.windows).toEqual([{ start: 780, end: 900 }]);
    expect(tuesday.minutes).toBe(120);
  });

  it('gives a disjoint day zero and no windows', () => {
    const availability = defaultAvailability();
    availability.days.fri = '4pm-6pm';
    const friday = computeMeetingOverlap(availability, CLIENT_HOURS).days[4];
    expect(friday.minutes).toBe(0);
    expect(friday.windows).toEqual([]);
  });

  it('matches both segments of a client range that crosses midnight', () => {
    const availability = defaultAvailability();
    availability.days.mon = '05:00-07:00, 23:00-23:30';
    const overlap = computeMeetingOverlap(availability, parseTimeRange('10:00 PM – 6:00 AM')!);
    expect(overlap.days[0].windows).toEqual([
      { start: 300, end: 360 },
      { start: 1380, end: 1410 },
    ]);
    expect(overlap.days[0].minutes).toBe(90);
  });

  it('is all zeroes for an untouched week, with a typical of zero rather than NaN', () => {
    const overlap = computeMeetingOverlap(defaultAvailability(), CLIENT_HOURS);
    expect(overlap.totalMinutes).toBe(0);
    expect(overlap.typicalMinutes).toBe(0);
  });

  // The merge in `parseDayHours` is what stops the shared hours being counted twice here.
  it('does not double-count hours two overlapping ranges share', () => {
    const availability = defaultAvailability();
    availability.days.mon = '9-1, 11am-3pm';
    const monday = computeMeetingOverlap(availability, CLIENT_HOURS).days[0];
    expect(monday.minutes).toBe(360);
    expect(monday.windows).toEqual([{ start: 540, end: 900 }]);
  });
});
