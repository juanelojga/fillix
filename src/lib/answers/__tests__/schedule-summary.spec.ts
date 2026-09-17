import { describe, it, expect } from 'vitest';
import { summarizeSchedule } from '../schedule-summary';
import { checkSchedule } from '../schedule-check';
import { noQuestionTimes, type QuestionTimes } from '../question-times';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';

const ZONE = 'America/Guayaquil';
const NOW = new Date('2026-09-17T12:00:00Z');
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.timeZone = ZONE;
  availability.days.mon = '9-1, 3-6pm';
  availability.days.tue = '9-1';
  availability.days.wed = '3-6pm';
  return availability;
}

function summarize(partial: Partial<QuestionTimes>) {
  const availability = sampleWeek();
  const times: QuestionTimes = { ...noQuestionTimes(), ...partial };
  return summarizeSchedule(checkSchedule(availability, times, ZONE, NOW));
}

function slot(date: string, start: number, end: number, zone: string, source: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { source, date: { year, month, day }, start, end, zone };
}

describe('summarizeSchedule', () => {
  // The pairing is the check: a wrong reading is caught without reading the answer.
  it('pairs the question’s words with the converted local time', () => {
    const { lines } = summarize({
      slots: [slot('2026-09-21', at(17), at(18), 'GMT+02:00', 'September 21, 5pm - 6pm')],
    });
    expect(lines).toEqual([
      {
        source: 'September 21, 5pm - 6pm',
        local: 'Monday 21 September 2026, 10:00–11:00',
        status: 'available',
      },
    ]);
  });

  it('shows both halves of a slot that crossed local midnight', () => {
    const { lines } = summarize({
      slots: [slot('2026-09-22', at(12), at(16), 'Asia/Tokyo', 'Tuesday midday JST')],
    });
    expect(lines[0].local).toBe(
      'Monday 21 September 2026, 22:00–24:00 + Tuesday 22 September 2026, 00:00–02:00',
    );
    expect(lines[0].status).toBe('unavailable');
  });

  it('summarises a recurring window as the days it touches and a typical overlap', () => {
    const { lines } = summarize({
      recurring: [
        {
          source: "Madrid's business hours",
          start: at(9),
          end: at(17),
          zone: 'Europe/Madrid',
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        },
      ],
    });
    // Wednesday is an afternoon only, so it is absent from the overlapping days.
    expect(lines[0].local).toBe('Mon, Tue · 1 h on a typical day');
    // Never "available" outright — a recurring window is an overlap, not an offer.
    expect(lines[0].status).toBe('partial');
  });

  it('says plainly when a recurring window does not overlap at all', () => {
    const { lines } = summarize({
      recurring: [
        { source: 'nights', start: at(22), end: at(23), zone: 'America/Guayaquil', days: ['mon'] },
      ],
    });
    expect(lines[0].local).toBe('no overlap with your hours');
    expect(lines[0].status).toBe('unavailable');
  });

  it('lists what was not checked, with why', () => {
    const { unchecked } = summarize({
      slots: [slot('2026-09-21', at(9), at(17), '', '9 to 5')],
      unreadable: ['whenever suits you'],
    });
    expect(unchecked).toEqual([
      'whenever suits you — not readable as a time',
      '9 to 5 — no time zone stated',
    ]);
  });
});
