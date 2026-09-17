import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AvailabilityEditor from './AvailabilityEditor.svelte';
import { availability, browserTimeZone } from '../stores/availability';
import { defaultAvailability } from '../../lib/profile/availability';

let storageSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const fresh = defaultAvailability();
  fresh.timeZone = browserTimeZone();
  availability.set(fresh);
  storageSet = vi.fn().mockResolvedValue(undefined);
  // @ts-expect-error — replacing stub
  chrome.storage.local.set = storageSet;
});

function written() {
  return storageSet.mock.calls.at(-1)?.[0].availability;
}

function field(day: string) {
  return screen.getByLabelText(`${day} hours`);
}

/**
 * The row that owns one day's field, so an assertion cannot accidentally match the help text
 * above — which names `09:00–13:00` as an example of what can be typed.
 */
function row(day: string) {
  return within(field(day).closest('div.flex-col') as HTMLElement);
}

describe('AvailabilityEditor', () => {
  it('gives every weekday one labelled text field', () => {
    render(AvailabilityEditor);
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(field(day)).toBeInTheDocument();
    }
  });

  // The defect this editor replaced: the time boxes were disabled until a checkbox was ticked,
  // so on a fresh install no hours could be entered at all.
  it('lets the hours be typed straight away, with nothing to enable first', () => {
    render(AvailabilityEditor);
    for (const day of ['Monday', 'Friday']) {
      expect(field(day)).toBeEnabled();
    }
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('persists what was typed, verbatim', async () => {
    render(AvailabilityEditor);
    await fireEvent.input(field('Monday'), { target: { value: '9-1, 3-6pm' } });

    await waitFor(() => expect(storageSet).toHaveBeenCalled());
    expect(written().days.mon).toBe('9-1, 3-6pm');
  });

  // The safety net the whole free-text field rests on: the parser gives `9-1` the benefit of
  // the doubt, so the reading is shown back where a wrong one is immediately visible.
  it('echoes how it read the hours under the field', async () => {
    availability.update((a) => ({ ...a, days: { ...a.days, mon: '9-1, 3-6pm' } }));
    render(AvailabilityEditor);
    expect(row('Monday').getByText('09:00–13:00 and 15:00–18:00')).toBeInTheDocument();
  });

  it('reads a shorthand afternoon the way it was meant', async () => {
    availability.update((a) => ({ ...a, days: { ...a.days, thu: '3-6pm' } }));
    render(AvailabilityEditor);
    expect(row('Thursday').getByText('15:00–18:00')).toBeInTheDocument();
  });

  it('says "not available" for an empty day rather than leaving it blank', () => {
    render(AvailabilityEditor);
    expect(screen.getAllByText('not available')).toHaveLength(5);
  });

  it('names a fragment it could not read, quoting it as typed', () => {
    availability.update((a) => ({ ...a, days: { ...a.days, fri: 'mornings' } }));
    render(AvailabilityEditor);
    expect(row('Friday').getByText(/couldn't read "mornings"/i)).toBeInTheDocument();
  });

  it('keeps the part it could read while naming the part it could not', () => {
    availability.update((a) => ({ ...a, days: { ...a.days, wed: '9am-1pm, whenever' } }));
    render(AvailabilityEditor);
    expect(row('Wednesday').getByText(/couldn't read "whenever"/i)).toBeInTheDocument();
    expect(row('Wednesday').getByText('09:00–13:00')).toBeInTheDocument();
  });

  it('copies Monday’s text onto every weekday', async () => {
    availability.update((a) => ({ ...a, days: { ...a.days, mon: '9-1, 3-6pm' } }));
    render(AvailabilityEditor);

    await fireEvent.click(screen.getByRole('button', { name: /apply monday to every weekday/i }));

    await waitFor(() => expect(storageSet).toHaveBeenCalled());
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      expect(written().days[day]).toBe('9-1, 3-6pm');
    }
  });

  it('persists a typed time zone on blur', async () => {
    render(AvailabilityEditor);
    const zone = screen.getByLabelText('Time zone');
    await fireEvent.input(zone, { target: { value: 'Europe/Madrid' } });
    await fireEvent.blur(zone);

    await waitFor(() => expect(storageSet).toHaveBeenCalled());
    expect(written().timeZone).toBe('Europe/Madrid');
  });

  // A job page states the client's hours in the browser's zone, so a mismatch drops the overlap.
  it('warns that the overlap will be left out when the zone is not the browser’s', () => {
    availability.update((a) => ({ ...a, timeZone: 'Antarctica/Troll' }));
    render(AvailabilityEditor);
    expect(
      screen.getByText(/overlap with the client's hours will be left out/i),
    ).toBeInTheDocument();
  });

  it('shows no such warning when the zone matches the browser', () => {
    render(AvailabilityEditor);
    expect(screen.queryByText(/will be left out/i)).not.toBeInTheDocument();
  });

  it('says nothing is contributed while no hours read', () => {
    render(AvailabilityEditor);
    expect(screen.getByText(/nothing about your schedule is added/i)).toBeInTheDocument();
  });

  it('stops saying that once a day reads', () => {
    availability.update((a) => ({ ...a, days: { ...a.days, mon: '9-1' } }));
    render(AvailabilityEditor);
    expect(screen.queryByText(/nothing about your schedule is added/i)).not.toBeInTheDocument();
  });

  it('reports when it last saved', async () => {
    render(AvailabilityEditor);
    expect(screen.getByText('Nothing set yet')).toBeInTheDocument();

    availability.update((a) => ({ ...a, updatedAt: Date.now() }));
    await waitFor(() => expect(screen.getByText(/^Saved /)).toBeInTheDocument());
  });

  it('tells the user these hours do not affect the search index', () => {
    render(AvailabilityEditor);
    expect(screen.getByText(/never makes your search index stale/i)).toBeInTheDocument();
  });
});
