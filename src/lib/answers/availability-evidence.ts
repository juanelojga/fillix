import type { JobBrief } from '../playbooks/job-brief';
import type { WeeklyAvailability } from '../profile/availability';
import { renderAvailability } from '../profile/availability-text';
import { computeMeetingOverlap } from './meeting-overlap';
import type { ScheduleCheck } from './schedule-check';
import { renderScheduleCheck } from './schedule-text';
import { parseTimeRange } from './time-range';

/**
 * The applicant's meeting hours, ready to append to the retrieved evidence.
 *
 * This is the module that knows the job board's label, for the same reason `job-context.ts`
 * knows what a `JobBrief` is: the drafting path is where a job and a profile meet, and the
 * mechanism either side of it stays ignorant of both.
 */

/**
 * Toptal's label for the client's working day.
 *
 * The value beside it is already converted into the *viewer's* timezone — a posting reading
 * `Client's Hours: 2:00 AM – 3:00 PM` alongside `Time Zone: Madrid, 7 hrs ahead` is a
 * 9:00–22:00 Madrid day shown to someone seven hours behind. That is the only reason an
 * overlap can be computed at all without knowing where the client is.
 */
const CLIENT_HOURS_LABEL = "Client's Hours";

/**
 * The overlap is dropped, and the hours kept, whenever the comparison cannot be trusted:
 *
 * - no brief, or no `Client's Hours` on it;
 * - a value `parseTimeRange` does not recognise;
 * - a chosen timezone other than the browser's, because the conversion above was made into
 *   the *browser's* zone. Intersecting it with hours stated in another zone would be wrong by
 *   exactly the offset between them, and wrong in the confident direction.
 *
 * In every one of those cases the applicant's own hours still go to the model. Saying "here
 * are my hours" is always true; saying "we overlap by four hours" has to be earned.
 */
export function buildAvailabilityEvidence(
  availability: WeeklyAvailability,
  brief: JobBrief | null,
  browserTimeZone: string,
  now: Date = new Date(),
  /**
   * The times this particular question asked about, already checked. Null when the question
   * mentioned none, or when the extraction step failed — in which case the weekly hours still
   * go to the model, exactly as they do when the client-hours attribute cannot be read.
   */
  schedule: ScheduleCheck | null = null,
): string {
  const label = brief?.attributes[CLIENT_HOURS_LABEL]?.trim() ?? '';
  const zonesAgree = availability.timeZone !== '' && availability.timeZone === browserTimeZone;
  const clientHours = label && zonesAgree ? parseTimeRange(label) : null;

  const base = clientHours
    ? renderAvailability(
        availability,
        { clientHoursLabel: label, overlap: computeMeetingOverlap(availability, clientHours) },
        now,
      )
    : renderAvailability(availability, null, now);

  // No hours stored means no heading, and an appended block with nothing to cite would be
  // discarded by the grounding guard in `draft-answer.ts` — taking a correct answer with it.
  // There is also nothing to have checked the question's times against.
  if (!base || !schedule) return base;

  return `${base}${renderScheduleCheck(availability, schedule)}`;
}
