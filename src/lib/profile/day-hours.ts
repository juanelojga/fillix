import { mergeRanges, parseWrittenTime, type Minutes } from '../answers/time-range';

/**
 * One weekday of hours, as the user typed them.
 *
 * Separate from `answers/time-range.ts` on purpose, and the split is the point: that module
 * parses what a *job board rendered*, which is always explicit (`2:00 AM – 3:00 PM`). This one
 * parses what a *person typed*, which is `9-1` and `3-6pm` and `9am-1pm, 3-6pm`. Giving a job
 * board's value the benefit of the doubt would be inventing precision it already has; refusing
 * to give a person's typing any would make the field unusable.
 *
 * Nothing here ever guesses silently. Every fragment it cannot read comes back in
 * `unreadable`, named as typed, and the editor prints it back — because an hour a recruiter
 * reads is not somewhere to be quietly approximate.
 */

export interface DayHours {
  /** Merged and ordered, so overlapping entries cannot be counted twice. */
  ranges: Minutes[];
  /** Fragments that could not be read, exactly as typed. */
  unreadable: string[];
}

/** `9am-1pm, 3-6pm` / `9-1 and 3-6` / one per line. */
const FRAGMENT = /\s*(?:,|;|\/|\band\b|\n)\s*/i;

/** `9-1`, `9 to 1`, `9–1`, `9 until 1`. */
const RANGE = /\s*(?:–|—|-|\bto\b|\buntil\b|\btill\b)\s*/i;

/** Ways of writing "nothing", so an explicit blank day is not reported as a mistake. */
const NOTHING = new Set(['', 'none', 'no', 'n/a', 'na', 'nil', 'off', 'unavailable', 'nothing']);

const HALF_DAY = 12 * 60;
const FULL_DAY = 24 * 60;

/**
 * One `9am-1pm` fragment.
 *
 * Two conventions, and both are here rather than in the strict parser because both are about
 * what a person means, not what a clock says:
 *
 * - **A named half-day governs both ends.** `3-6pm` is an afternoon. Read literally it is
 *   03:00–18:00, a fifteen-hour day nobody typed.
 * - **A bare end earlier than the start is the same afternoon.** `9-1` is a working day, not
 *   an overnight meeting. `22-6` is left alone, because 22 cannot be shifted anywhere.
 *
 * Neither convention applies when it would produce an out-of-order range, so an explicit
 * `10pm-6am` still wraps past midnight.
 *
 * What is deliberately *not* guessed: `1-5`, where both ends are bare and already in order,
 * reads as 01:00–05:00 even though an applicant almost certainly meant the afternoon. Shifting
 * both ends would be inventing a working day out of two digits. The editor echoes the reading
 * underneath the field instead, so a wrong one is visible immediately and `1pm-5pm` fixes it.
 */
function parseFragment(text: string): Minutes[] | null {
  const parts = text.split(RANGE).filter((part) => part.trim() !== '');
  if (parts.length !== 2) return null;

  const from = parseWrittenTime(parts[0]);
  const to = parseWrittenTime(parts[1]);
  if (!from || !to) return null;

  let start = from.minutes;
  let end = to.minutes;

  if (from.hadMeridiem !== to.hadMeridiem) {
    // The bare end borrows the half-day the other one named, when that keeps the range ordered.
    if (!from.hadMeridiem && start + HALF_DAY < end) start += HALF_DAY;
    else if (!to.hadMeridiem && end < start && end + HALF_DAY > start) end += HALF_DAY;
  } else if (!from.hadMeridiem && end < start && end + HALF_DAY > start) {
    end += HALF_DAY;
  }

  if (start === end) return null;
  if (start < end) return [{ start, end }];

  // Genuinely wrapped past midnight — two segments of one day, so it can intersect a morning.
  const segments = [{ start, end: FULL_DAY }];
  if (end > 0) segments.unshift({ start: 0, end });
  return segments;
}

export function parseDayHours(text: string): DayHours {
  const trimmed = text.trim();
  if (NOTHING.has(trimmed.toLowerCase())) return { ranges: [], unreadable: [] };

  const ranges: Minutes[] = [];
  const unreadable: string[] = [];

  for (const fragment of trimmed.split(FRAGMENT)) {
    const piece = fragment.trim();
    if (piece === '') continue;
    const parsed = parseFragment(piece);
    if (parsed) ranges.push(...parsed);
    else unreadable.push(piece);
  }

  return { ranges: mergeRanges(ranges), unreadable };
}
