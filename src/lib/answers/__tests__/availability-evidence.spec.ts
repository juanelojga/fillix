import { describe, it, expect } from 'vitest';
import { buildAvailabilityEvidence } from '../availability-evidence';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';
import type { JobBrief } from '../../playbooks/job-brief';

const ZONE = 'America/Guayaquil';
const WINTER = new Date('2026-01-15T12:00:00Z');
function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.timeZone = ZONE;
  availability.days.mon = '9-11, 3-6pm';
  availability.days.tue = '9-1';
  return availability;
}

function brief(attributes: Record<string, string>): JobBrief {
  return { description: '', attributes, skills: { required: [], optional: [] } };
}

describe('buildAvailabilityEvidence', () => {
  it('states the hours and the overlap when the client hours parse and the zones agree', () => {
    const text = buildAvailabilityEvidence(
      sampleWeek(),
      brief({ "Client's Hours": '2:00 AM – 3:00 PM', 'Time Zone': 'Madrid, 7 hrs ahead' }),
      ZONE,
      WINTER,
    );
    expect(text).toContain('Monday: 09:00–11:00 and 15:00–18:00');
    expect(text).toContain("Overlap with this client's hours (2:00 AM – 3:00 PM)");
    expect(text).toContain('Monday: 2 h (09:00–11:00)');
  });

  // Every skip path keeps the hours. "Here are my hours" is always true; an overlap is earned.
  it('keeps the hours and drops the overlap when there is no brief', () => {
    const text = buildAvailabilityEvidence(sampleWeek(), null, ZONE, WINTER);
    expect(text).toContain('Monday: 09:00–11:00 and 15:00–18:00');
    expect(text).not.toContain('Overlap');
  });

  it('keeps the hours and drops the overlap when the attribute is absent', () => {
    const text = buildAvailabilityEvidence(
      sampleWeek(),
      brief({ Commitment: 'Full-time (40 hrs/wk)' }),
      ZONE,
      WINTER,
    );
    expect(text).toContain('Tuesday: 09:00–13:00');
    expect(text).not.toContain('Overlap');
  });

  it('keeps the hours and drops the overlap when the attribute does not parse', () => {
    const text = buildAvailabilityEvidence(
      sampleWeek(),
      brief({ "Client's Hours": 'Flexible' }),
      ZONE,
      WINTER,
    );
    expect(text).toContain('Tuesday: 09:00–13:00');
    expect(text).not.toContain('Overlap');
  });

  // The job page converted the client's hours into the *browser's* zone. Intersecting them
  // with hours declared in another zone would be wrong by exactly the offset between them.
  it('drops the overlap when the chosen zone is not the browser’s', () => {
    const text = buildAvailabilityEvidence(
      sampleWeek(),
      brief({ "Client's Hours": '2:00 AM – 3:00 PM' }),
      'Europe/Madrid',
      WINTER,
    );
    expect(text).toContain('Monday: 09:00–11:00 and 15:00–18:00');
    expect(text).not.toContain('Overlap');
  });

  it('drops the overlap when no zone has been chosen at all', () => {
    const availability = sampleWeek();
    availability.timeZone = '';
    const text = buildAvailabilityEvidence(
      availability,
      brief({ "Client's Hours": '2:00 AM – 3:00 PM' }),
      '',
      WINTER,
    );
    expect(text).toContain('in my own local time:');
    expect(text).not.toContain('Overlap');
  });

  it('is empty when no hours are entered, so an untouched editor adds nothing to a prompt', () => {
    expect(
      buildAvailabilityEvidence(
        defaultAvailability(),
        brief({ "Client's Hours": '2:00 AM – 3:00 PM' }),
        ZONE,
        WINTER,
      ),
    ).toBe('');
  });
});
