import { describe, it, expect } from 'vitest';
import { mentionsTime } from '../mentions-time';

describe('mentionsTime', () => {
  it('fires on the question shapes this feature exists for', () => {
    expect(mentionsTime('September 21, 2026 from 5pm - 6pm (GMT+02:00). Are these times OK?')).toBe(
      true,
    );
    expect(
      mentionsTime(
        "Ideally the client would like someone who can overlap with Madrid's business hours (9 to 5).",
      ),
    ).toBe(true);
    expect(mentionsTime('What is your availability?')).toBe(true);
    expect(mentionsTime('Can you join a standup at 08:30 UTC?')).toBe(true);
    expect(mentionsTime('Would Tuesday work for a call?')).toBe(true);
  });

  // The asymmetry is deliberate: a false positive costs one empty generation, a false negative
  // silently skips the check on a question that needed it.
  it('does not fire on an ordinary experience question', () => {
    expect(mentionsTime('Describe your experience with Python and FastAPI.')).toBe(false);
    expect(mentionsTime('Why are you interested in this role?')).toBe(false);
    expect(mentionsTime('What is your expected rate?')).toBe(false);
  });
});
