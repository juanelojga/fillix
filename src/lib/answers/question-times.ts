import { WEEKDAYS, type Weekday } from '../profile/availability';
import { MINUTES_PER_DAY, parseClock } from './time-range';
import type { CalendarDate } from './zone-offset';

/**
 * Reading the times out of an application question.
 *
 * This is the one place in the drafting path where a model is asked something and believed —
 * and it is deliberately asked to do only the thing models are reliably good at. It extracts:
 * it copies dates, clock times and zone names out of a sentence into fields. It is never asked
 * what any of them *mean*. No conversion, no weekday, no comparison, no verdict. Every one of
 * those is arithmetic, and `schedule-check.ts` does all of it in integers.
 *
 * That division is why this can generalise. A regex handles the phrasings we wrote rules for;
 * a form that words its slots as a table, or in Spanish, or as "Tue the 22nd, 5:30-7:30 CEST",
 * is the same extraction problem and a different regex problem. What keeps it honest is that
 * nothing the model emits is trusted on its own: every field below is re-parsed by
 * `normalizeQuestionTimes`, and anything that fails comes back in `unreadable` rather than
 * being repaired into something plausible.
 */

export interface ExtractedSlot {
  /** The question's own words for this slot, shown on the card beside the verdict. */
  source: string;
  date: CalendarDate;
  /** Minutes from midnight, in `zone`. */
  start: number;
  end: number;
  /** A written offset or an IANA id. '' when the question named none — never guessed. */
  zone: string;
}

export interface ExtractedRecurring {
  source: string;
  start: number;
  end: number;
  zone: string;
  /** Which weekdays it applies to. Never empty — a bare mention defaults to Monday–Friday. */
  days: Weekday[];
}

export interface QuestionTimes {
  slots: ExtractedSlot[];
  recurring: ExtractedRecurring[];
  /** Time mentions that could not be put in shape, verbatim. Named on the card, never dropped. */
  unreadable: string[];
}

export function noQuestionTimes(): QuestionTimes {
  return { slots: [], recurring: [], unreadable: [] };
}

export function hasQuestionTimes(times: QuestionTimes): boolean {
  return times.slots.length > 0 || times.recurring.length > 0 || times.unreadable.length > 0;
}

/** Enough for one question and its answer. The prompt is small; the default 2048 is not. */
export const EXTRACT_NUM_CTX = 4096;

/** Extraction is a short generation on a small input — nothing like drafting an answer. */
export const EXTRACT_TIMEOUT_MS = 60_000;

export const EXTRACT_SYSTEM_PROMPT = [
  'You extract times and dates from one question on a job application. You do not answer it.',
  'Copy what the text says into fields. Never convert a time between zones, never work out what day a date falls on, and never decide whether anything is convenient — those are done elsewhere, in code.',
  '"slots" are specific dated offers, e.g. an interview time on a named date.',
  '"recurring" are repeating hours with no single date, e.g. a client\'s working day or a window for regular meetings.',
  'Write every clock time as 24-hour "HH:MM". A time written as 5pm is "17:00".',
  'Write every date as "YYYY-MM-DD". Use the year the text gives; if it gives none, use the next occurrence of that date after today.',
  '"zone" is the time zone the text states for that time: copy an explicit offset exactly as written ("GMT+02:00"), or give the IANA identifier for a place it names ("Madrid time" is "Europe/Madrid"). If the text states no zone for it, use "". Never guess a zone.',
  '"days" on a recurring entry lists the weekdays it covers, from mon, tue, wed, thu, fri. Business hours with no days named are all five.',
  '"source" is the exact substring of the question that the entry came from, copied character for character.',
  'Put any mention of a time or date you cannot express in these fields into "unreadable", copied verbatim. Never round, shift or complete a time to make it fit.',
  'A question with no times or dates in it returns three empty arrays.',
  'Respond with JSON only: {"slots":[{"source":"","date":"","start":"","end":"","zone":""}],"recurring":[{"source":"","start":"","end":"","zone":"","days":[]}],"unreadable":[]}',
].join('\n');

/** ISO plus the weekday name, because "next Tuesday" needs both to be resolvable. */
function describeToday(today: Date): string {
  const iso = today.toISOString().slice(0, 10);
  const name = today.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${iso} (${name})`;
}

export function buildQuestionTimesPrompt(question: string, today: Date): string {
  return [`Today is ${describeToday(today)}.`, '', 'The question:', question].join('\n');
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Whether this function's own output is an acceptable input to it.
 *
 * It has to be. `MessageResponse` types `times` as a parsed `QuestionTimes`, but what reaches
 * the panel is JSON that crossed a process boundary, so `question-schedule.ts` re-validates it
 * — and the worker sends the *normalised* value, because `extractQuestionTimes` normalises
 * before returning. A parser that accepted only the wire shape therefore rejected every real
 * extraction, pushed it into `unreadable`, and reported "could not be checked" for times it had
 * read perfectly. Being idempotent is what makes that re-validation a defence rather than a
 * silent discard.
 *
 * Strictness on the wire shape is unchanged: a string is still only read as `YYYY-MM-DD`, and
 * a number only as minutes already in range.
 */
function parseMinutesValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY ? value : null;
  }
  return parseClock(asString(value));
}

function parseDate(value: unknown): CalendarDate | null {
  let year: number;
  let month: number;
  let day: number;

  if (typeof value === 'object' && value !== null) {
    const parts = value as Record<string, unknown>;
    if (
      typeof parts['year'] !== 'number' ||
      typeof parts['month'] !== 'number' ||
      typeof parts['day'] !== 'number'
    ) {
      return null;
    }
    year = parts['year'];
    month = parts['month'];
    day = parts['day'];
  } else {
    const match = ISO_DATE.exec(asString(value));
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Rejects 2026-02-30, which passes the range check above and would otherwise silently
  // become 2 March once `Date` normalised it.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month, day };
}

function parseDays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [...WEEKDAYS];
  const days = WEEKDAYS.filter((day) => value.includes(day));
  // An empty or unrecognisable list is the model failing to answer the question rather than
  // saying "no days", and a recurring window that applies to nothing could never overlap.
  return days.length > 0 ? days : [...WEEKDAYS];
}

/**
 * The single place the extraction response's shape is enforced.
 *
 * Every entry that fails validation is pushed into `unreadable` under its own `source`, so a
 * dropped slot is still visible to the user. Falling back to a repaired value would produce
 * exactly the confident, wrong verdict this whole path exists to prevent.
 */
export function normalizeQuestionTimes(raw: Record<string, unknown>): QuestionTimes {
  const slots: ExtractedSlot[] = [];
  const recurring: ExtractedRecurring[] = [];
  const unreadable: string[] = [];

  for (const item of Array.isArray(raw['unreadable']) ? raw['unreadable'] : []) {
    const text = asString(item);
    if (text) unreadable.push(text);
  }

  for (const item of Array.isArray(raw['slots']) ? raw['slots'] : []) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const source = asString(entry['source']);
    const date = parseDate(entry['date']);
    const start = parseMinutesValue(entry['start']);
    const end = parseMinutesValue(entry['end']);

    if (!date || start === null || end === null || start === end) {
      if (source) unreadable.push(source);
      continue;
    }
    slots.push({
      source: source || describeSlot(date, start, end),
      date,
      start,
      end,
      zone: asString(entry['zone']),
    });
  }

  for (const item of Array.isArray(raw['recurring']) ? raw['recurring'] : []) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const source = asString(entry['source']);
    const start = parseMinutesValue(entry['start']);
    const end = parseMinutesValue(entry['end']);

    if (start === null || end === null || start === end) {
      if (source) unreadable.push(source);
      continue;
    }
    recurring.push({
      source: source || 'the hours this question mentions',
      start,
      end,
      zone: asString(entry['zone']),
      days: parseDays(entry['days']),
    });
  }

  return { slots, recurring, unreadable };
}

/** A fallback label for a valid slot the model forgot to quote. Never shown otherwise. */
function describeSlot(date: CalendarDate, start: number, end: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return `${date.year}-${pad(date.month)}-${pad(date.day)} ${clock(start)}–${clock(end)}`;
}
