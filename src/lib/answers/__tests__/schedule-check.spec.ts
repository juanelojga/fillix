import { describe, it, expect } from 'vitest';
import { checkSchedule, isEmptyCheck, type SlotVerdict } from '../schedule-check';
import { noQuestionTimes, type QuestionTimes } from '../question-times';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';

/** The applicant: Ecuador, GMT-05:00 all year, mornings plus a Monday/Wednesday afternoon. */
const ZONE = 'America/Guayaquil';
const NOW = new Date('2026-09-17T12:00:00Z');

function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.timeZone = ZONE;
  availability.days.mon = '9-1, 3-6pm';
  availability.days.tue = '9-1';
  availability.days.wed = '3-6pm';
  availability.days.thu = '9-1';
  availability.days.fri = '9-1';
  return availability;
}

function times(partial: Partial<QuestionTimes>): QuestionTimes {
  return { ...noQuestionTimes(), ...partial };
}

function slot(date: string, start: number, end: number, zone: string, source = date) {
  const [year, month, day] = date.split('-').map(Number);
  return { source, date: { year, month, day }, start, end, zone };
}

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

describe('checkSchedule — dated interview slots', () => {
  // The question that motivated the whole path: three offered slots, stated in the client's
  // zone, against hours stated in the applicant's.
  const offered = times({
    slots: [
      slot('2026-09-21', at(17), at(18), 'GMT+02:00', 'September 21, 2026 from 5pm - 6pm'),
      slot('2026-09-22', at(17, 30), at(19, 30), 'GMT+02:00', 'September 22, 2026 from 5:30pm'),
      slot('2026-09-23', at(18), at(19), 'GMT+02:00', 'September 23, 2026 from 6pm - 7pm'),
    ],
  });

  it('converts each slot into the applicant’s zone and rules on it', () => {
    const check = checkSchedule(sampleWeek(), offered, ZONE, NOW);
    expect(check.unchecked).toEqual([]);
    expect(check.slots.map((s) => s.status)).toEqual(['available', 'available', 'unavailable']);
  });

  it('reports the local day and time, not the offered one', () => {
    const [monday] = checkSchedule(sampleWeek(), offered, ZONE, NOW).slots;
    expect(monday.segments).toHaveLength(1);
    expect(monday.segments[0].date).toEqual({ year: 2026, month: 9, day: 21 });
    expect(monday.segments[0].day).toBe('mon');
    expect(monday.segments[0].local).toEqual({ start: at(10), end: at(11) });
    expect(monday.zoneLabel).toBe('GMT+02:00');
  });

  it('counts the matched minutes rather than asserting a bare yes or no', () => {
    const [, tuesday] = checkSchedule(sampleWeek(), offered, ZONE, NOW).slots;
    expect(tuesday.offeredMinutes).toBe(120);
    expect(tuesday.matchedMinutes).toBe(120);
  });

  it('says partial when only some of a slot lands inside the hours', () => {
    // 17:00–20:00 GMT+02:00 is 10:00–13:00 locally; Monday's morning ends at 13:00, so the
    // last hour of the offer is outside it... and the afternoon window starts at 15:00.
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-21', at(17), at(21), 'GMT+02:00', 'Mon 5-9pm')] }),
      ZONE,
      NOW,
    );
    const [only] = check.slots;
    expect(only.status).toBe('partial');
    expect(only.offeredMinutes).toBe(240);
    expect(only.matchedMinutes).toBe(180);
    expect(only.segments[0].matched).toEqual([{ start: at(10), end: at(13) }]);
  });

  it('splits a slot that crosses local midnight and checks each half against its own day', () => {
    // 12:00–16:00 in Tokyo on Tuesday is 22:00 Monday to 02:00 Tuesday in Guayaquil.
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-22', at(12), at(16), 'Asia/Tokyo', 'Tue midday JST')] }),
      ZONE,
      NOW,
    );
    const [only] = check.slots;
    expect(only.segments.map((s) => [s.day, s.local])).toEqual([
      ['mon', { start: at(22), end: at(24) }],
      ['tue', { start: at(0), end: at(2) }],
    ]);
    // Neither half touches the stored hours, and the verdict says so rather than guessing.
    expect(only.status).toBe('unavailable');
  });

  it('handles a window that runs past midnight in its own zone', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-20', at(23), at(2), 'GMT+02:00', 'Sun 11pm-2am')] }),
      ZONE,
      NOW,
    );
    // 23:00 Sunday to 02:00 Monday in GMT+02:00 is 16:00–19:00 Sunday in Guayaquil.
    expect(check.slots[0].segments[0].date).toEqual({ year: 2026, month: 9, day: 20 });
    expect(check.slots[0].segments[0].local).toEqual({ start: at(16), end: at(19) });
  });

  it('reports a weekend slot as unavailable, since no hours are stored for one', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-19', at(17), at(18), 'GMT+02:00', 'Saturday')] }),
      ZONE,
      NOW,
    );
    expect(check.slots[0].segments[0].day).toBeNull();
    expect(check.slots[0].status).toBe('unavailable');
  });
});

describe('checkSchedule — recurring hours', () => {
  it('converts a client working day and states the per-day overlap', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({
        recurring: [
          {
            source: "Madrid's business hours (9 to 5)",
            start: at(9),
            end: at(17),
            zone: 'Europe/Madrid',
            days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        ],
      }),
      ZONE,
      NOW,
    );

    const [entry] = check.recurring;
    // 09:00–17:00 in Madrid in September is 02:00–10:00 in Guayaquil.
    expect(entry.days.map((d) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(entry.days[0].local).toEqual([{ start: at(2), end: at(10) }]);
    // Only the last hour of it is inside a 09:00 start.
    expect(entry.days[0].minutes).toBe(60);
    // Wednesday is an afternoon only, so nothing overlaps at all.
    expect(entry.days[2].minutes).toBe(0);
    expect(entry.typicalMinutes).toBe(60);
    expect(entry.totalMinutes).toBe(240);
  });

  it('handles the evening advisor window from the same question', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({
        recurring: [
          {
            source: 'between 5 pm and 9 pm Madrid time',
            start: at(17),
            end: at(21),
            zone: 'Europe/Madrid',
            days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        ],
      }),
      ZONE,
      NOW,
    );

    const [entry] = check.recurring;
    // 17:00–21:00 Madrid is 10:00–14:00 in Guayaquil.
    expect(entry.days[0].local).toEqual([{ start: at(10), end: at(14) }]);
    expect(entry.days[0].minutes).toBe(180);
    expect(entry.typicalMinutes).toBe(180);
  });
});

describe('checkSchedule — what it refuses to compare', () => {
  it('will not assume a zone the question never stated', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-21', at(9), at(17), '', '9 to 5')] }),
      ZONE,
      NOW,
    );
    expect(check.slots).toEqual([]);
    expect(check.unchecked).toEqual([{ source: '9 to 5', reason: 'no-zone' }]);
  });

  it('will not guess at a zone it cannot place', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({ slots: [slot('2026-09-21', at(17), at(18), 'CEST', '5pm CEST')] }),
      ZONE,
      NOW,
    );
    expect(check.unchecked).toEqual([{ source: '5pm CEST', reason: 'unknown-zone' }]);
  });

  it('carries the extraction’s own unreadable fragments through, named', () => {
    const check = checkSchedule(
      sampleWeek(),
      times({ unreadable: ['whenever suits you'] }),
      ZONE,
      NOW,
    );
    expect(check.unchecked).toEqual([{ source: 'whenever suits you', reason: 'unreadable' }]);
  });

  it('is empty when the question named no times at all', () => {
    expect(isEmptyCheck(checkSchedule(sampleWeek(), noQuestionTimes(), ZONE, NOW))).toBe(true);
  });
});

describe('checkSchedule — the applicant with no hours on that day', () => {
  it('matches nothing without throwing when the day is blank', () => {
    const availability = defaultAvailability();
    availability.timeZone = ZONE;
    availability.days.mon = '9-1';

    const check = checkSchedule(
      availability,
      times({ slots: [slot('2026-09-22', at(17), at(18), 'GMT+02:00', 'Tuesday')] }),
      ZONE,
      NOW,
    );
    const [only]: SlotVerdict[] = check.slots;
    expect(only.matchedMinutes).toBe(0);
    expect(only.status).toBe('unavailable');
  });
});
