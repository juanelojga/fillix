import { WEEKDAYS, type WeeklyAvailability, type Weekday } from '../profile/availability';
import { WEEKDAY_INDEX, resolveAt, toLocalSegments, type CheckedSegment } from './local-window';
import { median } from './meeting-overlap';
import type { ExtractedRecurring, ExtractedSlot, QuestionTimes } from './question-times';
import { mergeRanges, totalMinutes, type Minutes } from './time-range';
import type { CalendarDate, ResolvedZone } from './zone-offset';

export type { CheckedSegment } from './local-window';

/**
 * What the question's times come to, against the applicant's own hours.
 *
 * Every number here is computed in integers, for the reason `meeting-overlap.ts` states and
 * this module inherits: a model asked whether 5pm in Madrid suits someone in Guayaquil will
 * answer confidently, and a wrong answer is an interview the applicant does not show up to.
 * The model's only job upstream was to copy the times out of the sentence.
 *
 * What it does *not* do is convert anything: `local-window.ts` owns that, because a dated slot
 * and a recurring client day are different things to report and the same thing to convert. What
 * is left here is the reporting — the statuses, the per-day rollup, and which mentions come back
 * uncompared with their reason attached.
 */

export type SlotStatus = 'available' | 'partial' | 'unavailable';

export interface SlotVerdict {
  /** The question's own words, quoted back so a wrong reading is visible at a glance. */
  source: string;
  /** The zone as resolved: `GMT+02:00`, or the IANA id the extraction reported. */
  zoneLabel: string;
  /** Usually one. Two when the window crosses midnight in the applicant's zone. */
  segments: CheckedSegment[];
  offeredMinutes: number;
  matchedMinutes: number;
  status: SlotStatus;
}

export interface RecurringDay {
  day: Weekday;
  /** The window in the applicant's clock, merged across whichever source days landed here. */
  local: Minutes[];
  matched: Minutes[];
  minutes: number;
}

export interface RecurringVerdict {
  source: string;
  zoneLabel: string;
  days: RecurringDay[];
  /** The median over the overlapping days only — see `meeting-overlap.ts`. */
  typicalMinutes: number;
  totalMinutes: number;
}

export type UncheckedReason = 'no-zone' | 'unknown-zone' | 'unreadable';

export interface UncheckedMention {
  source: string;
  reason: UncheckedReason;
}

export interface ScheduleCheck {
  slots: SlotVerdict[];
  recurring: RecurringVerdict[];
  /** Named, never dropped: a time we did not check is not a time that does not matter. */
  unchecked: UncheckedMention[];
}

export function isEmptyCheck(check: ScheduleCheck): boolean {
  return check.slots.length === 0 && check.recurring.length === 0 && check.unchecked.length === 0;
}

function checkSlot(
  availability: WeeklyAvailability,
  slot: ExtractedSlot,
  timeZone: string,
): SlotVerdict | UncheckedMention {
  if (!slot.zone) return { source: slot.source, reason: 'no-zone' };

  const zone = resolveAt(slot.zone, slot.date, slot.start);
  if (!zone) return { source: slot.source, reason: 'unknown-zone' };

  const segments = toLocalSegments(
    availability,
    timeZone,
    slot.date,
    slot.start,
    slot.end,
    zone.offsetMinutes,
  );
  if (segments.length === 0) return { source: slot.source, reason: 'unknown-zone' };

  const offeredMinutes = totalMinutes(segments.map((s) => s.local));
  const matchedMinutes = segments.reduce((sum, s) => sum + s.matchedMinutes, 0);

  return {
    source: slot.source,
    zoneLabel: zone.label,
    segments,
    offeredMinutes,
    matchedMinutes,
    status:
      matchedMinutes === 0
        ? 'unavailable'
        : matchedMinutes >= offeredMinutes
          ? 'available'
          : 'partial',
  };
}

/** The next occurrence of a weekday on or after `from`, as a plain calendar date. */
function nextOccurrence(from: Date, day: Weekday): CalendarDate {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const shift = (WEEKDAY_INDEX[day] - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + shift);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * A recurring window is checked on a real date per weekday rather than as a bare offset shift,
 * so that a window landing on the previous or next local day is attributed to the day it
 * actually falls on — and so DST is read from the calendar instead of assumed away.
 */
function checkRecurring(
  availability: WeeklyAvailability,
  entry: ExtractedRecurring,
  timeZone: string,
  now: Date,
): RecurringVerdict | UncheckedMention {
  if (!entry.zone) return { source: entry.source, reason: 'no-zone' };

  const byDay = new Map<Weekday, { local: Minutes[]; matched: Minutes[] }>();
  let resolved: ResolvedZone | null = null;

  for (const day of entry.days) {
    const date = nextOccurrence(now, day);
    const zone = resolveAt(entry.zone, date, entry.start);
    if (!zone) continue;
    resolved ??= zone;

    for (const segment of toLocalSegments(
      availability,
      timeZone,
      date,
      entry.start,
      entry.end,
      zone.offsetMinutes,
    )) {
      if (!segment.day) continue;
      const bucket = byDay.get(segment.day) ?? { local: [], matched: [] };
      bucket.local.push(segment.local);
      bucket.matched.push(...segment.matched);
      byDay.set(segment.day, bucket);
    }
  }

  if (!resolved) return { source: entry.source, reason: 'unknown-zone' };

  const days: RecurringDay[] = [...byDay.entries()]
    .map(([day, bucket]) => {
      const matched = mergeRanges(bucket.matched);
      return { day, local: mergeRanges(bucket.local), matched, minutes: totalMinutes(matched) };
    })
    .sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));

  return {
    source: entry.source,
    zoneLabel: resolved.label,
    days,
    typicalMinutes: median(days.filter((d) => d.minutes > 0).map((d) => d.minutes)),
    totalMinutes: days.reduce((sum, d) => sum + d.minutes, 0),
  };
}

function isUnchecked<T extends object>(value: T | UncheckedMention): value is UncheckedMention {
  return 'reason' in value;
}

/**
 * The whole check. `timeZone` is the applicant's own, and every local time below is in it.
 *
 * Nothing is inferred on the question's behalf: an entry whose zone the question never stated,
 * or whose zone this browser does not know, comes back under `unchecked` with its own wording
 * rather than being compared against an assumed one.
 */
export function checkSchedule(
  availability: WeeklyAvailability,
  times: QuestionTimes,
  timeZone: string,
  now: Date = new Date(),
): ScheduleCheck {
  const slots: SlotVerdict[] = [];
  const recurring: RecurringVerdict[] = [];
  const unchecked: UncheckedMention[] = times.unreadable.map((source) => ({
    source,
    reason: 'unreadable' as const,
  }));

  for (const slot of times.slots) {
    const result = checkSlot(availability, slot, timeZone);
    if (isUnchecked(result)) unchecked.push(result);
    else slots.push(result);
  }

  for (const entry of times.recurring) {
    const result = checkRecurring(availability, entry, timeZone, now);
    if (isUnchecked(result)) unchecked.push(result);
    else recurring.push(result);
  }

  return { slots, recurring, unchecked };
}
