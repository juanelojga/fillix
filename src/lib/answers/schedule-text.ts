import {
  WEEKDAY_NAMES,
  describeRanges,
  dayRanges,
  type WeeklyAvailability,
} from '../profile/availability';
import { formatClock, formatDuration } from './time-range';
import type {
  CheckedSegment,
  RecurringVerdict,
  ScheduleCheck,
  SlotVerdict,
  UncheckedMention,
} from './schedule-check';
import type { CalendarDate } from './zone-offset';

/**
 * The computed schedule check, as lines the model can quote.
 *
 * Written in the applicant's own voice, because it is appended inside the `## Meeting
 * availability` section that `availability-text.ts` renders — one heading, one citation, and
 * `SHARED_RULES` already tells the model that times and hour counts in the excerpts are correct
 * and must never be recalculated. That rule is what this module's output depends on: every
 * conversion and every duration below is already done.
 *
 * Unchecked mentions are stated as plainly as the checked ones and in the same voice. A time we
 * could not verify has to reach the answer as "I would need to confirm that", never as silence
 * — silence is what lets a model fill the gap from its own training.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Hand-rolled rather than `toLocaleDateString`: the wording must not depend on the ICU build. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Exported so the card words a date exactly as the evidence did — one owner, one wording. */
export function describeDate(date: CalendarDate): string {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return `${DAY_NAMES[weekday]} ${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}`;
}

function describeSegment(segment: CheckedSegment): string {
  const { start, end } = segment.local;
  return `${describeDate(segment.date)}, ${formatClock(start)}–${formatClock(end)}`;
}

/**
 * What the applicant's own hours are on the days a slot touched.
 *
 * Carried even on an unavailable slot, and especially there: a recruiter reading "that one does
 * not work" needs the alternative in the same breath, and the model can only offer one if the
 * evidence states it.
 */
function describeMyHours(availability: WeeklyAvailability, segments: CheckedSegment[]): string {
  const parts = segments.map((segment) => {
    const label = describeDate(segment.date).split(' ')[0];
    if (!segment.day) return `${label}: I have no hours set`;
    const windows = describeRanges(dayRanges(availability, segment.day));
    return `${label}: ${windows || 'no hours set'}`;
  });
  return parts.join('; ');
}

function renderSlot(availability: WeeklyAvailability, slot: SlotVerdict): string {
  const when = slot.segments.map(describeSegment).join(' and ');
  const lead = `"${slot.source}" (${slot.zoneLabel}) is ${when} in my own time zone.`;
  const mine = describeMyHours(availability, slot.segments);

  if (slot.status === 'available') {
    return `${lead} I am free for all of it.`;
  }
  if (slot.status === 'unavailable') {
    return `${lead} That falls outside my hours — ${mine}.`;
  }

  const matched = slot.segments.flatMap((segment) => segment.matched);
  return (
    `${lead} I am free for part of it: ${describeRanges(matched)} ` +
    `(${formatDuration(slot.matchedMinutes)} of the ${formatDuration(slot.offeredMinutes)} offered). ` +
    `My hours are ${mine}.`
  );
}

function renderRecurring(entry: RecurringVerdict): string[] {
  const lines = [
    `"${entry.source}" (${entry.zoneLabel}) falls in my own time zone as:`,
    ...entry.days.map((day) => {
      const local = describeRanges(day.local);
      if (day.minutes === 0)
        return `${WEEKDAY_NAMES[day.day]}: ${local} — no overlap with my hours`;
      return `${WEEKDAY_NAMES[day.day]}: ${local} — I am free for ${formatDuration(day.minutes)} of it (${describeRanges(day.matched)})`;
    }),
  ];

  if (entry.totalMinutes > 0) {
    lines.push(
      `Typical weekday overlap with these hours: ${formatDuration(entry.typicalMinutes)}. ` +
        `Across the week: ${formatDuration(entry.totalMinutes)}.`,
    );
  }
  return lines;
}

/** Why a mention went unchecked, in the applicant's voice rather than the system's. */
function describeUnchecked(mention: UncheckedMention): string {
  const reason =
    mention.reason === 'no-zone'
      ? 'no time zone was stated for it'
      : mention.reason === 'unknown-zone'
        ? 'I could not place that time zone'
        : 'I could not read it as a time';
  return `"${mention.source}" — ${reason}`;
}

/**
 * The lines to append under the availability heading, or '' when there is nothing to add.
 *
 * Returns '' rather than a "nothing found" note: a question that mentioned no times should look
 * exactly like one that was never checked, because it was not.
 */
export function renderScheduleCheck(
  availability: WeeklyAvailability,
  check: ScheduleCheck,
): string {
  const parts: string[] = [];

  if (check.slots.length > 0) {
    parts.push(
      '',
      'The specific times this question offers, already converted into my own time zone and checked against the hours above:',
      ...check.slots.map((slot) => renderSlot(availability, slot)),
    );
  }

  for (const entry of check.recurring) {
    parts.push('', ...renderRecurring(entry));
  }

  if (check.unchecked.length > 0) {
    parts.push(
      '',
      'I have not checked these against my hours, so I must not say whether they work without confirming first:',
      ...check.unchecked.map(describeUnchecked),
    );
  }

  return parts.join('\n');
}
