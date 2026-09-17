/**
 * Timezone arithmetic — the first and only place in this path entitled to make one.
 *
 * `time-range.ts` states that nothing there converts anything, and that stays true: it compares
 * minutes from midnight within a single zone. But a question that offers "17:00 (GMT+02:00)" to
 * an applicant in Guayaquil cannot be answered without a real conversion, and doing it by
 * subtracting two offsets is wrong twice over — once across DST, and once when the converted
 * time lands on a different calendar day than the one the question named.
 *
 * So everything here goes through an actual instant. A wall clock plus a zone becomes a `Date`;
 * that `Date` is then read back as a wall clock in the applicant's zone. Both halves are asked
 * of `Intl`, which owns the DST tables, rather than computed from an offset we cached earlier.
 *
 * Every function returns null rather than a fallback. A zone we cannot resolve is a comparison
 * we are not entitled to make, and `availability-evidence.ts` drops it and keeps the hours.
 */

/** `GMT+02:00`, or an IANA id when the question named a place rather than an offset. */
export interface ResolvedZone {
  /** Minutes east of UTC at the instant asked about. Negative west of Greenwich. */
  offsetMinutes: number;
  /** Printed beside every converted time, so a wrong resolution is visible on the card. */
  label: string;
}

/** A calendar day, with no time and no zone attached. */
export interface CalendarDate {
  year: number;
  /** 1-12, as a human writes it — not the 0-11 `Date` takes. */
  month: number;
  day: number;
}

/** A wall clock reading in some zone, plus the day it fell on. */
export interface WallClock extends CalendarDate {
  /** Minutes from midnight, 0..1439. */
  minutes: number;
  /** 0 = Sunday, 6 = Saturday. Derived from the date, never from a locale's weekday name. */
  weekday: number;
}

const MS_PER_MINUTE = 60_000;

/** `GMT+02:00`, `UTC-5`, `+02:00`, `-0500`. */
const FIXED_OFFSET = /^(?:gmt|utc)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i;

/** The zero offset written as a word. */
const ZERO_OFFSET = /^(?:z|utc|gmt)$/i;

/** `120` → `GMT+02:00`. The sign is always printed, because `GMT2` reads as ambiguous. */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `GMT${sign}${hours}:${minutes}`;
}

/**
 * Minutes east of UTC for an IANA zone at an instant, or null when the zone is unknown.
 *
 * Asked of `Intl` rather than kept in a table: `Europe/Madrid` is +01:00 in January and +02:00
 * in September, and a job application written in one is read in the other.
 */
export function zoneOffsetAt(timeZone: string, instant: Date): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value;
    if (!name) return null;
    // `longOffset` renders exactly zero as the bare word, with no sign to parse.
    if (ZERO_OFFSET.test(name)) return 0;
    return parseFixedOffset(name);
  } catch {
    // RangeError: an id this browser does not know. The caller drops the comparison.
    return null;
  }
}

/** `GMT+02:00` → 120. Null for anything that is not a written UTC offset. */
export function parseFixedOffset(value: string): number | null {
  const trimmed = value.trim();
  if (ZERO_OFFSET.test(trimmed)) return 0;

  const match = FIXED_OFFSET.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  // 14:00 is the largest real offset (Pacific/Kiritimati); beyond that it is not a zone.
  if (hours > 14 || minutes > 59) return null;

  const magnitude = hours * 60 + minutes;
  return match[1] === '-' ? -magnitude : magnitude;
}

/**
 * A zone as the extraction step reported it — a written offset or an IANA id — at an instant.
 *
 * `near` only matters for an IANA id, and only to pick the right side of a DST boundary. It is
 * the slot's own approximate instant, which is within an hour of the truth by construction, so
 * the only readings it can get wrong are inside the hour a zone actually changes.
 */
export function resolveZone(mention: string, near: Date): ResolvedZone | null {
  const trimmed = mention.trim();
  if (!trimmed) return null;

  const fixed = parseFixedOffset(trimmed);
  // A written offset is taken as written. Re-deriving it from a place name would be inventing
  // a DST opinion the question did not express.
  if (fixed !== null) return { offsetMinutes: fixed, label: formatOffset(fixed) };

  const offsetMinutes = zoneOffsetAt(trimmed, near);
  if (offsetMinutes === null) return null;
  return { offsetMinutes, label: trimmed };
}

/** The instant a wall clock denotes in a zone that is `offsetMinutes` east of UTC. */
export function instantOf(date: CalendarDate, minutes: number, offsetMinutes: number): Date {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  return new Date(asUtc - offsetMinutes * MS_PER_MINUTE);
}

/**
 * The same wall clock, one day later. Not `day + 1`: month ends and leap years are `Date`'s
 * problem, not this module's.
 */
export function nextDay(date: CalendarDate): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * An instant, read as a wall clock in a zone.
 *
 * `hourCycle: 'h23'` because the default renders midnight as `24` in some locales, which turns
 * a 00:30 start into 24:30 and puts it past the end of the day.
 *
 * The weekday comes from the formatted y/m/d rather than from `weekday: 'short'`, so no locale
 * string has to be mapped back to a number.
 */
export function wallClockIn(timeZone: string, instant: Date): WallClock | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);

    const read = (type: string): number => {
      const value = parts.find((part) => part.type === type)?.value;
      return value === undefined ? Number.NaN : Number(value);
    };

    const year = read('year');
    const month = read('month');
    const day = read('day');
    const hour = read('hour');
    const minute = read('minute');
    if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) return null;

    return {
      year,
      month,
      day,
      minutes: hour * 60 + minute,
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    };
  } catch {
    return null;
  }
}
