import {
  WEEKDAYS,
  dayRanges,
  type WeeklyAvailability,
  type Weekday,
} from '../profile/availability';
import { intersect, totalMinutes, type Minutes } from './time-range';
import {
  instantOf,
  nextDay,
  resolveZone,
  wallClockIn,
  type CalendarDate,
  type ResolvedZone,
  type WallClock,
} from './zone-offset';

/**
 * A window stated in some other zone → the local days and times it occupies, checked against
 * the applicant's hours.
 *
 * Lifted out of `schedule-check.ts` for the reason `injectable-tab.ts` was lifted out of
 * `active-tab-html.ts`: a second caller appeared. A dated interview slot and a recurring client
 * day are different things to *report*, and identical things to *convert* — and the conversion
 * is the part where a second copy would drift silently and be wrong by an hour twice a year.
 *
 * Everything here goes through a real instant, never a difference of offsets. The two failures
 * that makes impossible are exactly the two that occur in practice: a DST boundary between the
 * question's zone and the applicant's, and a converted time landing on a different calendar day
 * than the one the question named.
 */

/**
 * `Date`'s weekday numbering, 0 = Sunday. Saturday and Sunday are deliberately absent: no hours
 * are stored for them, so a window landing there matches nothing and says so.
 */
export const WEEKDAY_INDEX: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

function weekdayOf(date: CalendarDate): Weekday | null {
  const index = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return WEEKDAYS.find((day) => WEEKDAY_INDEX[day] === index) ?? null;
}

/** One part of a converted window, on the local day it actually fell on. */
export interface CheckedSegment {
  date: CalendarDate;
  /** null on a Saturday or Sunday, where no hours are stored and nothing can match. */
  day: Weekday | null;
  /** The offered window in the applicant's own clock. */
  local: Minutes;
  /** Where it meets the stored hours. Empty when it does not. */
  matched: Minutes[];
  matchedMinutes: number;
}

/**
 * The zone, resolved at the slot's own instant rather than at "now".
 *
 * Two passes, because an IANA zone's offset depends on the instant and the instant depends on
 * the offset. The first pass reads the wall clock as if it were UTC, which is within 14 hours
 * of the truth; the second uses that answer to land on the right side of a DST boundary. Only
 * a time inside the transition hour itself can still come out wrong.
 */
export function resolveAt(zone: string, date: CalendarDate, minutes: number): ResolvedZone | null {
  const first = resolveZone(zone, instantOf(date, minutes, 0));
  if (!first) return null;
  return resolveZone(zone, instantOf(date, minutes, first.offsetMinutes)) ?? first;
}

function check(
  availability: WeeklyAvailability,
  date: CalendarDate,
  local: Minutes,
): CheckedSegment {
  const day = weekdayOf(date);

  const matched: Minutes[] = [];
  if (day) {
    for (const slot of dayRanges(availability, day)) {
      const shared = intersect(slot, local);
      if (shared) matched.push(shared);
    }
  }
  matched.sort((a, b) => a.start - b.start);

  return { date, day, local, matched, matchedMinutes: totalMinutes(matched) };
}

/**
 * A window in some zone → the local days and times it occupies.
 *
 * An end at or before the start is the window running past midnight in its *own* zone
 * (`10pm–2am`), so it ends on the following date. After conversion the window may straddle
 * local midnight independently of that, which is why the split happens on the local readings
 * and not on the original numbers.
 */
export function toLocalSegments(
  availability: WeeklyAvailability,
  timeZone: string,
  date: CalendarDate,
  start: number,
  end: number,
  offsetMinutes: number,
): CheckedSegment[] {
  const startInstant = instantOf(date, start, offsetMinutes);
  const endInstant = instantOf(end <= start ? nextDay(date) : date, end, offsetMinutes);

  const from = wallClockIn(timeZone, startInstant);
  const to = wallClockIn(timeZone, endInstant);
  if (!from || !to) return [];

  // Stripped to the date alone. A `WallClock` is a superset of `CalendarDate`, so passing one
  // straight through typechecks and then carries a second copy of the start time on a field
  // named `date` — where the next reader would reasonably take it for something else.
  const dayOf = ({ year, month, day }: WallClock): CalendarDate => ({ year, month, day });

  const sameDay = from.year === to.year && from.month === to.month && from.day === to.day;
  if (sameDay) {
    return [check(availability, dayOf(from), { start: from.minutes, end: to.minutes })];
  }

  const head = check(availability, dayOf(from), { start: from.minutes, end: 24 * 60 });
  // A local end of exactly midnight is the head's own boundary, not a second day.
  if (to.minutes === 0) return [head];
  return [head, check(availability, dayOf(to), { start: 0, end: to.minutes })];
}
