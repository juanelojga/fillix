import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const storageGet = vi.fn();
const storageSet = vi.fn();
// Stubbed before the import below: storage.ts reads chrome at call time, but the store module
// is evaluated on import and must not find chrome missing.
vi.stubGlobal('chrome', {
  storage: { local: { get: storageGet, set: storageSet } },
  runtime: { sendMessage: vi.fn() },
});

const {
  availability,
  browserTimeZone,
  copyDayToWeek,
  hydrateAvailability,
  setDayHours,
  setTimeZone,
} = await import('../stores/availability');

/** What `setAvailability` was last handed. */
function written() {
  return storageSet.mock.calls.at(-1)?.[0].availability;
}

beforeEach(() => {
  storageGet.mockReset();
  storageSet.mockReset();
  storageGet.mockResolvedValue({});
  storageSet.mockResolvedValue(undefined);
});

describe('hydrateAvailability', () => {
  it('seeds the zone from the browser when nothing is stored', async () => {
    await hydrateAvailability();
    expect(get(availability).timeZone).toBe(browserTimeZone());
  });

  // Once there is a value the user owns it; re-hydrating must never overwrite their choice.
  it('leaves a stored zone alone even when it differs from the browser’s', async () => {
    storageGet.mockResolvedValue({ availability: { timeZone: 'Europe/Madrid' } });
    await hydrateAvailability();
    expect(get(availability).timeZone).toBe('Europe/Madrid');
  });

  it('normalizes what it reads, so a bad stored shape cannot reach the editor', async () => {
    storageGet.mockResolvedValue({ availability: { days: { mon: 42 } } });
    await hydrateAvailability();
    expect(get(availability).days.mon).toBe('');
  });

  // The shape stored before the editor took free text.
  it('converts the earlier two-window shape on the way in', async () => {
    storageGet.mockResolvedValue({
      availability: {
        days: { mon: [{ enabled: true, start: '09:00', end: '11:00' }] },
      },
    });
    await hydrateAvailability();
    expect(get(availability).days.mon).toBe('09:00-11:00');
  });
});

describe('setDayHours', () => {
  beforeEach(async () => {
    await hydrateAvailability();
    storageSet.mockClear();
  });

  // No draft copy and no Save button — every keystroke is the user's final word on it.
  it('writes through to storage on every change', async () => {
    await setDayHours('mon', '9am-1pm');
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(written().days.mon).toBe('9am-1pm');
    expect(get(availability).days.mon).toBe('9am-1pm');
  });

  it('stamps updatedAt so the editor can say when it saved', async () => {
    await setDayHours('mon', '9-1');
    expect(written().updatedAt).toBeGreaterThan(0);
  });

  it('changes one day without touching another', async () => {
    await setDayHours('thu', '2pm-6pm');
    expect(written().days.thu).toBe('2pm-6pm');
    expect(written().days.mon).toBe('');
  });

  // Verbatim, so a day the parser cannot read survives a reload and can be corrected.
  it('stores text it cannot parse exactly as typed', async () => {
    await setDayHours('fri', 'mornings');
    expect(written().days.fri).toBe('mornings');
  });

  it('does not rewrite a shorthand into a normalised form under the cursor', async () => {
    await setDayHours('mon', '9-1');
    expect(written().days.mon).toBe('9-1');
  });
});

describe('setTimeZone', () => {
  it('trims and persists', async () => {
    await hydrateAvailability();
    await setTimeZone('  Europe/Madrid  ');
    expect(get(availability).timeZone).toBe('Europe/Madrid');
    expect(written().timeZone).toBe('Europe/Madrid');
  });
});

describe('copyDayToWeek', () => {
  it('copies the source day’s text onto every weekday', async () => {
    await hydrateAvailability();
    await setDayHours('mon', '9-1, 3-6pm');
    await copyDayToWeek('mon');

    const days = written().days;
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      expect(days[day]).toBe('9-1, 3-6pm');
    }
  });

  it('copies an empty day too, which is how a whole week is cleared', async () => {
    await hydrateAvailability();
    await setDayHours('tue', '9-1');
    await copyDayToWeek('mon');
    expect(written().days.tue).toBe('');
  });
});
