import { describe, it, expect } from 'vitest';
import {
  EXTRACT_SYSTEM_PROMPT,
  buildQuestionTimesPrompt,
  hasQuestionTimes,
  noQuestionTimes,
  normalizeQuestionTimes,
} from '../question-times';

describe('buildQuestionTimesPrompt', () => {
  it('states today with its weekday, so "next Tuesday" is resolvable', () => {
    const prompt = buildQuestionTimesPrompt('When can you meet?', new Date('2026-09-17T12:00:00Z'));
    expect(prompt).toContain('2026-09-17 (Thursday)');
    expect(prompt).toContain('When can you meet?');
  });
});

describe('EXTRACT_SYSTEM_PROMPT', () => {
  // The division the whole design rests on: the model copies, the code computes.
  it('forbids the model from converting or interpreting anything', () => {
    expect(EXTRACT_SYSTEM_PROMPT).toContain('Never convert a time between zones');
    expect(EXTRACT_SYSTEM_PROMPT).toContain('Never guess a zone');
    expect(EXTRACT_SYSTEM_PROMPT).toContain('You do not answer it');
  });
});

describe('normalizeQuestionTimes', () => {
  /**
   * The worker normalises before it replies and the panel normalises again on arrival, so this
   * function's own output is one of its real inputs. When it was not, every extracted time was
   * discarded as unreadable — see the parseDate comment.
   */
  it('is idempotent — its own output normalises to itself', () => {
    const wire = {
      slots: [
        {
          source: 'Sep 21 5pm-6pm',
          date: '2026-09-21',
          start: '17:00',
          end: '18:00',
          zone: 'GMT+02:00',
        },
      ],
      recurring: [
        {
          source: '9am-5pm Madrid',
          start: '09:00',
          end: '17:00',
          zone: 'Europe/Madrid',
          days: ['mon', 'tue'],
        },
      ],
      unreadable: ['sometime next week'],
    };
    const once = normalizeQuestionTimes(wire);
    const twice = normalizeQuestionTimes(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(twice.unreadable).toEqual(['sometime next week']);
  });

  it('still refuses a number that is not a valid minute-of-day', () => {
    const out = normalizeQuestionTimes({
      slots: [{ source: 'bad', date: { year: 2026, month: 9, day: 21 }, start: 1440, end: 60 }],
      recurring: [],
      unreadable: [],
    });
    expect(out.slots).toEqual([]);
    expect(out.unreadable).toEqual(['bad']);
  });

  it('still refuses an impossible date object', () => {
    const out = normalizeQuestionTimes({
      slots: [{ source: 'feb30', date: { year: 2026, month: 2, day: 30 }, start: 60, end: 120 }],
      recurring: [],
      unreadable: [],
    });
    expect(out.slots).toEqual([]);
    expect(out.unreadable).toEqual(['feb30']);
  });

  it('reads a well-formed dated slot', () => {
    const times = normalizeQuestionTimes({
      slots: [
        {
          source: 'September 21, 2026 from 5pm - 6pm (GMT+02:00)',
          date: '2026-09-21',
          start: '17:00',
          end: '18:00',
          zone: 'GMT+02:00',
        },
      ],
    });
    expect(times.slots).toEqual([
      {
        source: 'September 21, 2026 from 5pm - 6pm (GMT+02:00)',
        date: { year: 2026, month: 9, day: 21 },
        start: 1020,
        end: 1080,
        zone: 'GMT+02:00',
      },
    ]);
    expect(times.unreadable).toEqual([]);
  });

  it('reads a recurring window and its days', () => {
    const times = normalizeQuestionTimes({
      recurring: [
        {
          source: '5 to 9 pm Madrid',
          start: '17:00',
          end: '21:00',
          zone: 'Europe/Madrid',
          days: ['mon', 'fri'],
        },
      ],
    });
    expect(times.recurring[0].days).toEqual(['mon', 'fri']);
    expect(times.recurring[0].start).toBe(1020);
  });

  it('defaults a recurring window with no usable days to the working week', () => {
    const times = normalizeQuestionTimes({
      recurring: [
        { source: 'business hours', start: '09:00', end: '17:00', zone: 'UTC', days: [] },
      ],
    });
    expect(times.recurring[0].days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  });

  // Every one of these would otherwise reach the arithmetic as a confident, wrong number.
  it('demotes an entry it cannot validate to unreadable rather than repairing it', () => {
    const times = normalizeQuestionTimes({
      slots: [
        { source: 'bad date', date: '2026-02-30', start: '17:00', end: '18:00', zone: 'UTC' },
        { source: 'bad clock', date: '2026-09-21', start: '5pm', end: '18:00', zone: 'UTC' },
        { source: 'zero length', date: '2026-09-21', start: '17:00', end: '17:00', zone: 'UTC' },
        { source: 'no date', start: '17:00', end: '18:00', zone: 'UTC' },
      ],
    });
    expect(times.slots).toEqual([]);
    expect(times.unreadable).toEqual(['bad date', 'bad clock', 'zero length', 'no date']);
  });

  it('keeps an empty zone as empty rather than filling one in', () => {
    const times = normalizeQuestionTimes({
      slots: [{ source: '9 to 5', date: '2026-09-21', start: '09:00', end: '17:00' }],
    });
    expect(times.slots[0].zone).toBe('');
  });

  it('carries the model’s own unreadable list through', () => {
    const times = normalizeQuestionTimes({ unreadable: ['whenever suits', '', 42] });
    expect(times.unreadable).toEqual(['whenever suits']);
  });

  it('survives a response of the wrong shape entirely', () => {
    expect(normalizeQuestionTimes({})).toEqual(noQuestionTimes());
    expect(normalizeQuestionTimes({ slots: 'nope', recurring: null })).toEqual(noQuestionTimes());
  });
});

describe('hasQuestionTimes', () => {
  it('counts an unreadable mention as something worth reporting', () => {
    expect(hasQuestionTimes(noQuestionTimes())).toBe(false);
    expect(hasQuestionTimes({ ...noQuestionTimes(), unreadable: ['x'] })).toBe(true);
  });
});
