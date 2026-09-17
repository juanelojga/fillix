import { describe, it, expect } from 'vitest';
import { AVAILABILITY_HEADING, describeZone, renderAvailability } from '../availability-text';
import { defaultAvailability, type WeeklyAvailability } from '../availability';
import { computeMeetingOverlap } from '../../answers/meeting-overlap';
import { parseTimeRange } from '../../answers/time-range';

/** Mid-January, so the offset is a fixed standard-time one wherever the suite runs. */
const WINTER = new Date('2026-01-15T12:00:00Z');

function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.timeZone = 'America/Guayaquil';
  availability.days.mon = '9-11, 3-6pm';
  availability.days.tue = '9-1';
  availability.days.wed = '9-11, 3-6pm';
  availability.days.thu = '2pm-6pm';
  return availability;
}

describe('describeZone', () => {
  it('names the zone with its current offset, so the hours are actionable elsewhere', () => {
    expect(describeZone('America/Guayaquil', WINTER)).toBe('America/Guayaquil, GMT-05:00');
  });

  it('returns the zone as typed when it is not one Intl knows', () => {
    expect(describeZone('Somewhere/Made Up', WINTER)).toBe('Somewhere/Made Up');
  });

  it('is empty for an unset zone', () => {
    expect(describeZone('', WINTER)).toBe('');
  });
});

describe('renderAvailability', () => {
  // An empty section would read as a claim of having no availability at all.
  it('is empty when no day has readable hours', () => {
    expect(renderAvailability(defaultAvailability(), null, WINTER)).toBe('');
  });

  // This heading is the citation string an answer's `drew_on` has to echo, so it is pinned.
  it('leads with the `## Meeting availability` heading', () => {
    const text = renderAvailability(sampleWeek(), null, WINTER);
    expect(AVAILABILITY_HEADING).toBe('Meeting availability');
    expect(text.startsWith('## Meeting availability\n')).toBe(true);
  });

  it('names the zone and its offset in the lead line', () => {
    expect(renderAvailability(sampleWeek(), null, WINTER)).toContain(
      'All times are in my own time zone (America/Guayaquil, GMT-05:00):',
    );
  });

  it('falls back to "my own local time" when no zone is set', () => {
    const availability = sampleWeek();
    availability.timeZone = '';
    const text = renderAvailability(availability, null, WINTER);
    expect(text).toContain('in my own local time:');
    expect(text).not.toContain('time zone (');
  });

  // "and" rather than a comma: a comma reads as a list the model may reformat or extend.
  it('joins two ranges with "and" on one line', () => {
    expect(renderAvailability(sampleWeek(), null, WINTER)).toContain(
      'Monday: 09:00–11:00 and 15:00–18:00',
    );
  });

  it('words a day with no hours rather than omitting it', () => {
    const text = renderAvailability(sampleWeek(), null, WINTER);
    expect(text).toContain('Tuesday: 09:00–13:00');
    expect(text).toContain('Friday: not available');
  });

  it('omits the overlap paragraph entirely when there is no context', () => {
    const text = renderAvailability(sampleWeek(), null, WINTER);
    expect(text).not.toContain('Overlap');
    expect(text).not.toContain('Typical weekday overlap');
  });

  it('states the overlap it was handed, quoting the client hours as the page worded them', () => {
    const availability = sampleWeek();
    const clientHours = parseTimeRange('2:00 AM – 3:00 PM')!;
    const text = renderAvailability(
      availability,
      {
        clientHoursLabel: '2:00 AM – 3:00 PM',
        overlap: computeMeetingOverlap(availability, clientHours),
      },
      WINTER,
    );

    expect(text).toContain("Overlap with this client's hours (2:00 AM – 3:00 PM)");
    expect(text).toContain('Monday: 2 h (09:00–11:00)');
    expect(text).toContain('Tuesday: 4 h (09:00–13:00)');
    expect(text).toContain('Thursday: 1 h (14:00–15:00)');
    expect(text).toContain('Friday: none');
    expect(text).toContain('Typical weekday overlap: 2 h. Across the week: 9 h.');
  });
});
