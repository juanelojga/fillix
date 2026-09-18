/**
 * Clock times as integers, and the parser for a time range a job board displays.
 *
 * Everything downstream compares minutes from midnight rather than `Date`s: the ranges here
 * have no date at all — "Mondays, 9 to 1" is a weekly shape, not an instant — and giving them
 * one would invite a timezone conversion that nothing in this path is entitled to make.
 *
 * `Minutes` lives in this module, which imports nothing, so both `profile/availability.ts` and
 * `answers/availability-evidence.ts` can take it from a leaf without importing each other.
 */

/** Half-open `[start, end)`, minutes from midnight, 0..1440. */
export interface Minutes {
  start: number;
  end: number;
}

export const MINUTES_PER_DAY = 24 * 60;

/** `09:00` → 540. Null for anything that is not a well-formed 24-hour clock time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 540 → `09:00`. 1440 prints as `24:00`, which only a range end can be. */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** `4 h`, `1 h 30 m`, `45 m`, and `none` for nothing — read straight into first-person prose. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return 'none';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} m`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

/** A written clock time, and whether it said which half of the day it meant. */
export interface WrittenTime {
  minutes: number;
  /** True when the text named AM or PM. `profile/day-hours.ts` needs this, and only it. */
  hadMeridiem: boolean;
}

/**
 * One written clock time: `2:00 AM`, `14:00`, `9 PM`, `9`.
 *
 * Bare `12` is ambiguous and 12-hour clocks are the reason: `12:00 AM` is midnight and
 * `12:00 PM` is noon, so the meridiem is applied by mapping hour 12 to 0 first.
 *
 * `hadMeridiem` comes back because a bare hour cannot be read in isolation — what `3` means in
 * `3-6pm` is decided by the other end of the range. That judgment is not this module's to
 * make, so it reports the fact and lets its caller decide.
 */
export function parseWrittenTime(raw: string): WrittenTime | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(raw.trim());
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');

  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === 'pm') hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return { minutes: hours * 60 + minutes, hadMeridiem: meridiem !== undefined };
}

function parseTime(raw: string): number | null {
  return parseWrittenTime(raw)?.minutes ?? null;
}

/** En dash, em dash, hyphen or the word "to" — whichever the board happened to render. */
const SEPARATOR = /\s*(?:–|—|-|\bto\b)\s*/i;

/**
 * A leading "approximately" marker on a rendered range — Toptal writes `～ 3:00 AM – 11:00 AM`
 * with a fullwidth tilde when the client's hours are not firm.
 *
 * Stripped rather than refused, and the distinction matters: this module exists to parse what a
 * board *displayed*, and the clock times either side of the marker are as explicit as any other
 * posting's. Rejecting the range would invent no precision but would discard precision already
 * there — a quarter of real postings, silently losing their overlap and falling back to hours
 * alone. The marker qualifies how firm the hours are, which is the reader's judgment to make,
 * not a reason to be unable to compute the intersection at all.
 */
const APPROXIMATELY = /^[～~∼≈]\s*/;

/**
 * `2:00 AM – 3:00 PM` → `[{ start: 120, end: 900 }]`.
 *
 * Returns an **array** because a range that crosses midnight is two segments of one day:
 * `10:00 PM – 6:00 AM` is `[1320, 1440)` and `[0, 360)`. Intersecting a single wrapped range
 * would otherwise come out empty against every daytime slot.
 *
 * `null` means "not recognised", and is never a guess. The only caller shows the applicant's
 * own hours instead of an overlap it could not compute, which is the honest outcome.
 */
export function parseTimeRange(value: string): Minutes[] | null {
  const parts = value.trim().replace(APPROXIMATELY, '').split(SEPARATOR);
  if (parts.length !== 2) return null;

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (start === null || end === null) return null;

  if (start === end) return null;
  if (start < end) return [{ start, end }];
  // Wrapped past midnight. A 0 end is midnight *tonight*, so the tail is the whole evening.
  const segments = [{ start, end: MINUTES_PER_DAY }];
  if (end > 0) segments.unshift({ start: 0, end });
  return segments;
}

/** The intersection of two half-open ranges, or null when they do not touch. */
export function intersect(a: Minutes, b: Minutes): Minutes | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Sorted, with anything touching or overlapping folded into one range. */
export function mergeRanges(ranges: Minutes[]): Minutes[] {
  const sorted = [...ranges].sort((x, y) => x.start - y.start || x.end - y.end);
  const merged: Minutes[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

export function totalMinutes(ranges: Minutes[]): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
}
