import { describe, it, expect } from 'vitest';
import { renderScheduleCheck } from '../schedule-text';
import { checkSchedule } from '../schedule-check';
import { noQuestionTimes, type QuestionTimes } from '../question-times';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';
import { buildAvailabilityEvidence } from '../availability-evidence';
import { AVAILABILITY_HEADING } from '../../profile/availability-text';

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

function render(partial: Partial<QuestionTimes>, availability = sampleWeek()): string {
  const times: QuestionTimes = { ...noQuestionTimes(), ...partial };
  return renderScheduleCheck(availability, checkSchedule(availability, times, ZONE, NOW));
}

function slot(date: string, start: number, end: number, zone: string, source: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { source, date: { year, month, day }, start, end, zone };
}

describe('renderScheduleCheck', () => {
  it('quotes the question back beside the converted time', () => {
    const text = render({
      slots: [slot('2026-09-21', at(17), at(18), 'GMT+02:00', 'September 21, 2026 from 5pm - 6pm')],
    });
    expect(text).toContain('"September 21, 2026 from 5pm - 6pm" (GMT+02:00)');
    expect(text).toContain('Monday 21 September 2026, 10:00–11:00 in my own time zone');
    expect(text).toContain('I am free for all of it.');
  });

  // The alternative has to be in the evidence, or the model cannot offer one.
  it('states the applicant’s own hours when a slot does not fit', () => {
    const text = render({
      slots: [slot('2026-09-23', at(18), at(19), 'GMT+02:00', 'September 23 from 6pm - 7pm')],
    });
    expect(text).toContain('That falls outside my hours');
    expect(text).toContain('Wednesday: 15:00–18:00');
  });

  it('quantifies a partial fit rather than rounding it to yes or no', () => {
    const text = render({
      slots: [slot('2026-09-21', at(17), at(21), 'GMT+02:00', 'Monday 5-9pm')],
    });
    expect(text).toContain('I am free for part of it: 10:00–13:00');
    expect(text).toContain('(3 h of the 4 h offered)');
  });

  it('renders a recurring window per weekday with its overlap', () => {
    const text = render({
      recurring: [
        {
          source: "Madrid's business hours (9 to 5)",
          start: at(9),
          end: at(17),
          zone: 'Europe/Madrid',
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        },
      ],
    });
    expect(text).toContain('"Madrid\'s business hours (9 to 5)" (Europe/Madrid)');
    expect(text).toContain('Monday: 02:00–10:00 — I am free for 1 h of it (09:00–10:00)');
    expect(text).toContain('Wednesday: 02:00–10:00 — no overlap with my hours');
    expect(text).toContain('Typical weekday overlap with these hours: 1 h');
  });

  it('names what it did not check, in the applicant’s voice', () => {
    const text = render({
      slots: [slot('2026-09-21', at(9), at(17), '', '9 to 5')],
      unreadable: ['whenever suits you'],
    });
    expect(text).toContain('I must not say whether they work without confirming first');
    expect(text).toContain('"9 to 5" — no time zone was stated for it');
    expect(text).toContain('"whenever suits you" — I could not read it as a time');
  });

  it('adds nothing when the check is empty', () => {
    expect(render({})).toBe('');
  });
});

describe('the block the model actually receives', () => {
  const times: QuestionTimes = {
    ...noQuestionTimes(),
    slots: [slot('2026-09-21', at(17), at(18), 'GMT+02:00', 'Sept 21, 5pm - 6pm')],
  };

  it('appends the check inside the one citable availability section', () => {
    const availability = sampleWeek();
    const check = checkSchedule(availability, times, ZONE, NOW);
    const evidence = buildAvailabilityEvidence(availability, null, ZONE, NOW, check);

    expect(evidence.startsWith(`## ${AVAILABILITY_HEADING}`)).toBe(true);
    // One heading, so `drew_on` can cite it and the grounding guard lets the answer through.
    expect(evidence.match(/^## /gm)).toHaveLength(1);
    expect(evidence).toContain('Monday: 09:00–13:00 and 15:00–18:00');
    expect(evidence).toContain('Monday 21 September 2026, 10:00–11:00');
  });

  // No heading means no citation, and `draft-answer.ts` would discard the answer that used it.
  it('appends nothing when there are no hours, so no uncited block is ever produced', () => {
    const empty = defaultAvailability();
    empty.timeZone = ZONE;
    const check = checkSchedule(empty, times, ZONE, NOW);
    expect(buildAvailabilityEvidence(empty, null, ZONE, NOW, check)).toBe('');
  });

  it('is unchanged from before when no schedule check is passed', () => {
    const availability = sampleWeek();
    expect(buildAvailabilityEvidence(availability, null, ZONE, NOW)).toBe(
      buildAvailabilityEvidence(availability, null, ZONE, NOW, null),
    );
  });
});
