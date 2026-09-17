import { WEEKDAY_NAMES } from '../profile/availability';
import { describeDate } from './schedule-text';
import { formatClock, formatDuration } from './time-range';
import type { ScheduleCheck, SlotStatus, UncheckedMention } from './schedule-check';

/**
 * The schedule check as the card shows it — the `fill-outcome.ts` role, for a different reader.
 *
 * Separate from `schedule-text.ts` because the audiences differ and so do their failure modes.
 * That module writes prose for a model, where completeness matters and length is cheap; this
 * one writes labels for someone scanning a narrow panel before pressing Fill, where the only
 * thing that matters is whether a wrong reading is obvious at a glance.
 *
 * So every line here pairs the question's own words with the converted result. Checking the
 * verdict means checking that pairing, and it can be done without reading the answer at all.
 */

export interface ScheduleLine {
  /** The question's wording, quoted. */
  source: string;
  /** The converted time in the applicant's own zone, or the overlap for a recurring window. */
  local: string;
  status: SlotStatus;
}

export interface ScheduleSummary {
  lines: ScheduleLine[];
  /** Verbatim mentions nothing was computed for, with why. */
  unchecked: string[];
}

function describeUnchecked(mention: UncheckedMention): string {
  const reason =
    mention.reason === 'no-zone'
      ? 'no time zone stated'
      : mention.reason === 'unknown-zone'
        ? 'time zone not recognised'
        : 'not readable as a time';
  return `${mention.source} — ${reason}`;
}

export function summarizeSchedule(check: ScheduleCheck): ScheduleSummary {
  const lines: ScheduleLine[] = check.slots.map((slot) => ({
    source: slot.source,
    local: slot.segments
      .map(
        (segment) =>
          `${describeDate(segment.date)}, ${formatClock(segment.local.start)}–${formatClock(segment.local.end)}`,
      )
      .join(' + '),
    status: slot.status,
  }));

  for (const entry of check.recurring) {
    const overlapping = entry.days.filter((day) => day.minutes > 0);
    lines.push({
      source: entry.source,
      local:
        overlapping.length === 0
          ? 'no overlap with your hours'
          : `${overlapping.map((day) => WEEKDAY_NAMES[day.day].slice(0, 3)).join(', ')} · ${formatDuration(entry.typicalMinutes)} on a typical day`,
      // A recurring window is never "available" outright — it is an overlap, not an offer.
      status: overlapping.length === 0 ? 'unavailable' : 'partial',
    });
  }

  return { lines, unchecked: check.unchecked.map(describeUnchecked) };
}
