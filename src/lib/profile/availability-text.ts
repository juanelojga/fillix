import { formatDuration } from '../answers/time-range';
import type { MeetingOverlap } from '../answers/meeting-overlap';
import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  dayRanges,
  describeRanges,
  hasAnyHours,
  type WeeklyAvailability,
} from './availability';

/**
 * The applicant's meeting hours as one citable profile section.
 *
 * It has to lead with a `##` heading and nothing else will do. `answer-prompt.ts` tells the
 * model that `drew_on` holds the exact `##` headings it used, and `draft-answer.ts` throws
 * away any non-empty answer whose `drew_on` is empty — so an availability block without a
 * heading would produce a correct answer that the grounding guard then discards.
 *
 * `Meeting availability`, deliberately not `Availability`: the profile document's own
 * placeholder has long suggested a `## Availability` section, and two sections of one name
 * would make a citation ambiguous about which one the model actually read.
 */
export const AVAILABILITY_HEADING = 'Meeting availability';

/**
 * The zone with its current offset, because the zone name alone is not actionable to a
 * recruiter reading it somewhere else. `now` is injectable so the DST-dependent half is
 * testable rather than dependent on when the suite runs.
 */
export function describeZone(timeZone: string, now: Date = new Date()): string {
  if (!timeZone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName');
    return parts ? `${timeZone}, ${parts.value}` : timeZone;
  } catch {
    // An unknown zone is the user's own typing, and is shown back to them as they wrote it.
    return timeZone;
  }
}

export interface OverlapContext {
  /** The client's hours exactly as the job page worded them. Quoted, never re-derived. */
  clientHoursLabel: string;
  overlap: MeetingOverlap;
}

/**
 * Returns '' when no window is enabled anywhere, so an untouched editor contributes nothing
 * to any prompt — an empty section would read as "I have no availability", which is a claim.
 */
export function renderAvailability(
  availability: WeeklyAvailability,
  context: OverlapContext | null,
  now: Date = new Date(),
): string {
  if (!hasAnyHours(availability)) return '';

  const zone = describeZone(availability.timeZone, now);
  const lead = zone
    ? `I can take calls and meetings on these days. All times are in my own time zone (${zone}):`
    : 'I can take calls and meetings on these days, in my own local time:';

  const hours = WEEKDAYS.map((day) => {
    const windows = describeRanges(dayRanges(availability, day));
    return `${WEEKDAY_NAMES[day]}: ${windows || 'not available'}`;
  });

  const parts = [`## ${AVAILABILITY_HEADING}`, '', lead, ...hours];

  if (context) {
    const { clientHoursLabel, overlap } = context;
    parts.push(
      '',
      `Overlap with this client's hours (${clientHoursLabel}), which the job page states in my own time zone:`,
      ...overlap.days.map((day) => {
        if (day.minutes === 0) return `${WEEKDAY_NAMES[day.day]}: none`;
        return `${WEEKDAY_NAMES[day.day]}: ${formatDuration(day.minutes)} (${describeRanges(day.windows)})`;
      }),
      `Typical weekday overlap: ${formatDuration(overlap.typicalMinutes)}. Across the week: ${formatDuration(overlap.totalMinutes)}.`,
    );
  }

  return parts.join('\n');
}
