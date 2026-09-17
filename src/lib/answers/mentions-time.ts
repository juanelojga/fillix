/**
 * Whether a question is worth spending an extraction call on.
 *
 * The gate in front of `question-times.ts`, and deliberately a loose one. The two errors are
 * not symmetric: a false positive costs one small local generation that comes back empty, while
 * a false negative costs the whole feature on that question and does it silently — the answer
 * still gets written, just without the schedule ever being checked.
 *
 * So this fires on anything schedule-shaped and lets the extraction step be the one that says
 * "there are no times in here". It exists to keep a call off the other seven questions on a
 * form, not to be the arbiter of what counts as a time.
 */

/** A clock time in any of the shapes a form writes one: `5pm`, `17:00`, `5:30 p.m.`. */
const CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b|\b\d{1,2}:\d{2}\b/i;

/** A written offset or the word for one. */
const ZONE = /\b(?:gmt|utc|[+-]\d{1,2}:\d{2}|time\s?zone|timezone)\b/i;

const MONTH =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:[a-z]*)\b|\b\d{4}-\d{2}-\d{2}\b/i;

const WEEKDAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:[a-z]*day)?\b/i;

/**
 * Scheduling vocabulary. `hours` and `overlap` are here because "what overlap can you offer
 * with our hours?" contains no clock time at all and is squarely this feature's question.
 */
const SCHEDULING =
  /\b(?:availabilit(?:y|ies)|available|schedul(?:e|ing)|interview|meeting|meet|call|overlap|business hours|working hours|hours|sync)\b/i;

export function mentionsTime(question: string): boolean {
  return (
    CLOCK.test(question) ||
    ZONE.test(question) ||
    MONTH.test(question) ||
    WEEKDAY.test(question) ||
    SCHEDULING.test(question)
  );
}
