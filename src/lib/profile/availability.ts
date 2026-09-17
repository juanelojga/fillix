import { formatClock, type Minutes } from '../answers/time-range';
import { parseDayHours } from './day-hours';

/**
 * When the applicant can take a call, Monday to Friday.
 *
 * A structured sibling of the profile prose rather than a section inside it. Schedule is the
 * one thing an application asks that prose answers badly: it has to be compared against the
 * client's hours, and a sentence cannot be intersected with a time range. Keeping it typed
 * also keeps it out of the vector index, so editing an hour does not invalidate the
 * embeddings — see `index-staleness.ts`, which this module is deliberately not part of.
 *
 * What is stored is **the text the user typed**, not the ranges parsed out of it. The parse is
 * derived on every read, which costs nothing and buys two things: a day the parser cannot read
 * survives a reload so the user can come back and fix it, and the field always shows exactly
 * what was typed rather than a normalised rewrite of it.
 */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

/** Page order, and the order every rendered line comes out in. */
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
};

export interface WeeklyAvailability {
  /** IANA zone, e.g. `America/Guayaquil`. '' means never chosen. */
  timeZone: string;
  /** What the user typed per weekday: `9am-1pm, 3-6pm`. '' is a day off. */
  days: Record<Weekday, string>;
  updatedAt: number;
}

export function defaultAvailability(): WeeklyAvailability {
  return {
    timeZone: '',
    days: { mon: '', tue: '', wed: '', thu: '', fri: '' },
    updatedAt: 0,
  };
}

/**
 * The shape this feature stored before the editor took free text: two fixed windows a day,
 * each with an `enabled` flag. Converted rather than dropped — the hours are the user's, and
 * they are trivially expressible in the new field.
 */
function convertLegacyDay(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const written: string[] = [];
  for (const slot of raw) {
    const { enabled, start, end } = (slot ?? {}) as Record<string, unknown>;
    if (enabled !== true || typeof start !== 'string' || typeof end !== 'string') continue;
    written.push(`${start}-${end}`);
  }
  return written.join(', ');
}

function normalizeDay(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  return convertLegacyDay(raw) ?? '';
}

/** The validator for anything read back from storage, including a shape an older build wrote. */
export function normalizeAvailability(raw: unknown): WeeklyAvailability {
  const stored = (raw ?? {}) as Partial<WeeklyAvailability>;
  const days = (stored.days ?? {}) as Partial<Record<Weekday, unknown>>;

  return {
    timeZone: typeof stored.timeZone === 'string' ? stored.timeZone : '',
    days: {
      mon: normalizeDay(days.mon),
      tue: normalizeDay(days.tue),
      wed: normalizeDay(days.wed),
      thu: normalizeDay(days.thu),
      fri: normalizeDay(days.fri),
    },
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
  };
}

/** One day's readable hours as minutes: merged, ordered, and never double-counted. */
export function dayRanges(availability: WeeklyAvailability, day: Weekday): Minutes[] {
  return parseDayHours(availability.days[day]).ranges;
}

/** `09:00–13:00 and 15:00–18:00`, or '' when the day has no readable hours. */
export function describeRanges(ranges: Minutes[]): string {
  // "and" rather than a comma: this reads back to the user and into first-person prose, and a
  // comma there reads as the start of a list the model feels free to reformat or extend.
  return ranges.map((r) => `${formatClock(r.start)}–${formatClock(r.end)}`).join(' and ');
}

export function hasAnyHours(availability: WeeklyAvailability): boolean {
  return WEEKDAYS.some((day) => dayRanges(availability, day).length > 0);
}
