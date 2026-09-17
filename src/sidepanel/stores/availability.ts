import { get, writable } from 'svelte/store';
import {
  WEEKDAYS,
  defaultAvailability,
  normalizeAvailability,
  type Weekday,
  type WeeklyAvailability,
} from '../../lib/profile/availability';
import { getAvailability, setAvailability } from '../../lib/storage';

/**
 * The meeting-hours editor's state.
 *
 * A sibling of `stores/profile.ts` rather than part of it. That store is already at the size
 * this repo splits at, and the two have opposite save models: the profile document is edited
 * at length and saved deliberately, while this is a handful of controls whose every change is
 * the user's final word on it.
 *
 * So there is no draft copy and no dirty flag — each change writes through to storage at once.
 * Sharing the profile's Save button would put one control in charge of two things with
 * different staleness rules, and pressing it would then be ambiguous about what was saved.
 */

export const availability = writable<WeeklyAvailability>(defaultAvailability());

/** The zone the client's hours on a job page were converted into, for the mismatch warning. */
export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
};

export async function hydrateAvailability(): Promise<void> {
  const stored = await getAvailability();
  // Seeded, not forced: an empty zone is nobody's choice, and the browser's is right far more
  // often than not. Once there is a value the user owns it, and re-hydrating never touches it.
  if (!stored.timeZone) stored.timeZone = browserTimeZone();
  availability.set(stored);
}

async function commit(next: WeeklyAvailability): Promise<void> {
  const normalized = normalizeAvailability({ ...next, updatedAt: Date.now() });
  availability.set(normalized);
  await setAvailability(normalized);
}

/**
 * The hours for one weekday, exactly as typed.
 *
 * Stored verbatim rather than parsed first: a day the parser cannot read has to survive a
 * reload so the user can come back and correct it, and re-writing `9-1` as `09:00-13:00`
 * under their cursor would be its own kind of rude.
 */
export async function setDayHours(day: Weekday, text: string): Promise<void> {
  const current = get(availability);
  await commit({ ...current, days: { ...current.days, [day]: text } });
}

export async function setTimeZone(timeZone: string): Promise<void> {
  await commit({ ...get(availability), timeZone: timeZone.trim() });
}

/** Five fields is a lot of typing for what is usually one repeated pattern. */
export async function copyDayToWeek(source: Weekday): Promise<void> {
  const current = get(availability);
  const template = current.days[source];
  const days = { ...current.days };
  for (const day of WEEKDAYS) days[day] = template;
  await commit({ ...current, days });
}
