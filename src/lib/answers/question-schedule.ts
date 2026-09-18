import { hasAnyHours, type WeeklyAvailability } from '../profile/availability';
import { mentionsTime } from './mentions-time';
import { requestQuestionTimes } from './question-times-port';
import { normalizeQuestionTimes } from './question-times';
import { checkSchedule, isEmptyCheck, type ScheduleCheck } from './schedule-check';

/**
 * Where one question's raw extraction comes from: the port in the panel, Ollama in the eval.
 *
 * Deliberately a `Record`, not a `QuestionTimes` — see `question-times-port.ts`. Annotated
 * structurally rather than imported from there, so the transport module can depend on this one
 * without a cycle.
 */
export type QuestionTimesSource = (question: string) => Promise<Record<string, unknown> | null>;

/**
 * One question → what its times come to against the applicant's hours, or null.
 *
 * Runs in the panel, like the capture and the fill, and for the same kind of reason: the
 * *extraction* is an outbound request and belongs to the worker, but everything after it is
 * pure arithmetic over data the panel already holds. Sending the availability to the worker so
 * it could send a verdict back would put the one computation this feature exists to protect on
 * the far side of a message boundary, for no gain.
 *
 * **Every failure here returns null, and null is not an error.** The drafting path carries on
 * with the weekly hours alone — the same outcome as an unparseable `Client's Hours`. A question
 * whose times could not be read is one the model must answer more carefully, not one the
 * applicant should be unable to answer at all.
 */
export async function checkQuestionSchedule(
  question: string,
  availability: WeeklyAvailability,
  browserTimeZone: string,
  now: Date = new Date(),
  source: QuestionTimesSource = requestQuestionTimes,
): Promise<ScheduleCheck | null> {
  // Three cheap refusals before spending a generation. The last is the load-bearing one: with
  // no zone there is nothing to convert *into*, and a comparison would silently assume one.
  if (!mentionsTime(question)) return null;
  if (!hasAnyHours(availability)) return null;

  const timeZone = availability.timeZone || browserTimeZone;
  if (!timeZone) return null;

  const raw = await source(question);
  if (!raw) return null;

  // Re-normalised on this side of the port as well. `MessageResponse` is a compile-time claim
  // about a value that arrived as JSON, and this is the last point before the numbers are
  // treated as the applicant's stated availability.
  const times = normalizeQuestionTimes(raw);
  const check = checkSchedule(availability, times, timeZone, now);

  // A question that mentioned scheduling but named no actual time — "are you available to start
  // immediately?" — is the common case for the pre-filter firing, and it has nothing to add.
  return isEmptyCheck(check) ? null : check;
}
