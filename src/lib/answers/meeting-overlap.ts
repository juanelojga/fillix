import {
  WEEKDAYS,
  dayRanges,
  type WeeklyAvailability,
  type Weekday,
} from '../profile/availability';
import { intersect, totalMinutes, type Minutes } from './time-range';

/**
 * Where the applicant's meeting hours and the client's hours actually meet.
 *
 * Computed here rather than asked of the model, for the reason the whole `answers/` directory
 * exists: a language model asked to subtract two clock times will produce a confident number,
 * and a wrong overlap is a promise the applicant then has to keep.
 *
 * Both sides are assumed to be in the *same* timezone, which is sound only because the caller
 * checks it — `availability-evidence.ts` drops the overlap entirely when it cannot establish
 * that. Nothing in this module converts anything.
 */

export interface DayOverlap {
  day: Weekday;
  minutes: number;
  /** A list: each of a day's two windows can meet the client's hours separately. */
  windows: Minutes[];
}

export interface MeetingOverlap {
  days: DayOverlap[];
  totalMinutes: number;
  /** The median over the days that have any overlap — see below. */
  typicalMinutes: number;
}

/**
 * The median, not the mean, and over the overlapping days only.
 *
 * A single free Friday morning should not drag "a typical day" down, and a week of four solid
 * days plus one short one should not average into a number that describes none of them. The
 * mean is also the easier number to read as a commitment.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function computeMeetingOverlap(
  availability: WeeklyAvailability,
  clientHours: Minutes[],
): MeetingOverlap {
  const days: DayOverlap[] = WEEKDAYS.map((day) => {
    const windows: Minutes[] = [];
    for (const slot of dayRanges(availability, day)) {
      for (const segment of clientHours) {
        const shared = intersect(slot, segment);
        if (shared) windows.push(shared);
      }
    }
    windows.sort((a, b) => a.start - b.start);
    return { day, minutes: totalMinutes(windows), windows };
  });

  return {
    days,
    totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
    typicalMinutes: median(days.filter((day) => day.minutes > 0).map((day) => day.minutes)),
  };
}
