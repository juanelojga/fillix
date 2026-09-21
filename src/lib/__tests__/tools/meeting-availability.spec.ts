import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({ getAvailability: vi.fn() }));

import { meetingAvailability } from '../../tools/meeting-availability';
import { getAvailability } from '../../storage';
import { defaultAvailability } from '../../profile/availability';
import { AVAILABILITY_HEADING } from '../../profile/availability-text';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('meetingAvailability', () => {
  it('returns the citable hours block for the stored week', async () => {
    vi.mocked(getAvailability).mockResolvedValue({
      ...defaultAvailability(),
      timeZone: 'America/Guayaquil',
      days: { mon: '9am-1pm, 3-6pm', tue: '', wed: '9-1', thu: '', fri: '' },
    });

    const result = await meetingAvailability();

    expect(result).toContain(`## ${AVAILABILITY_HEADING}`);
    expect(result).toContain('09:00–13:00');
    expect(result).toContain('America/Guayaquil');
    expect(result).toContain('Tuesday: not available');
    expect(result.startsWith('Error:')).toBe(false);
  });

  // '' back from renderAvailability means no day reads. Returning it verbatim would look like
  // a successful lookup that found nothing, which is a claim of having no availability at all.
  it('refuses with a worded next step when no hours are stored', async () => {
    vi.mocked(getAvailability).mockResolvedValue(defaultAvailability());

    const result = await meetingAvailability();

    expect(result.startsWith('Error:')).toBe(true);
    expect(result).toContain('Profile tab');
  });

  it('never throws: a storage failure comes back as an Error string', async () => {
    vi.mocked(getAvailability).mockRejectedValue(new Error('storage unavailable'));

    await expect(meetingAvailability()).resolves.toBe('Error: storage unavailable');
  });
});
