import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkQuestionSchedule } from '../question-schedule';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';

const ZONE = 'America/Guayaquil';
const NOW = new Date('2026-09-17T12:00:00Z');
const QUESTION = 'Can you meet on September 21, 2026 from 5pm - 6pm (GMT+02:00)?';

function sampleWeek(): WeeklyAvailability {
  const availability = defaultAvailability();
  availability.timeZone = ZONE;
  availability.days.mon = '9-1';
  return availability;
}

/** The extraction the worker would have returned for QUESTION. */
const EXTRACTED = {
  slots: [
    {
      source: 'September 21, 2026 from 5pm - 6pm (GMT+02:00)',
      date: '2026-09-21',
      start: '17:00',
      end: '18:00',
      zone: 'GMT+02:00',
    },
  ],
  recurring: [],
  unreadable: [],
};

let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMessage = vi.fn(async () => ({ ok: true, times: EXTRACTED }));
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkQuestionSchedule', () => {
  it('extracts, converts and rules on the question’s own times', async () => {
    const check = await checkQuestionSchedule(QUESTION, sampleWeek(), ZONE, NOW);
    expect(check?.slots[0].status).toBe('available');
    expect(check?.slots[0].segments[0].local).toEqual({ start: 600, end: 660 });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'EXTRACT_QUESTION_TIMES',
      question: QUESTION,
    });
  });

  it('spends nothing on a question with no time in it', async () => {
    const check = await checkQuestionSchedule(
      'Describe your experience with Python.',
      sampleWeek(),
      ZONE,
      NOW,
    );
    expect(check).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('spends nothing when there are no stored hours to compare against', async () => {
    const check = await checkQuestionSchedule(QUESTION, defaultAvailability(), ZONE, NOW);
    expect(check).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Nothing to convert *into*. A comparison here would have to assume a zone.
  it('spends nothing when neither the profile nor the browser names a zone', async () => {
    const hours = sampleWeek();
    hours.timeZone = '';
    expect(await checkQuestionSchedule(QUESTION, hours, '', NOW)).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to the browser zone when the profile has none', async () => {
    const hours = sampleWeek();
    hours.timeZone = '';
    const check = await checkQuestionSchedule(QUESTION, hours, ZONE, NOW);
    expect(check?.slots[0].segments[0].local).toEqual({ start: 600, end: 660 });
  });

  // Every failure below is silent by design: the answer is still drafted, from the hours alone.
  it('returns null when the worker refuses', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'model not found' });
    expect(await checkQuestionSchedule(QUESTION, sampleWeek(), ZONE, NOW)).toBeNull();
  });

  it('returns null when the worker is unreachable', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    expect(await checkQuestionSchedule(QUESTION, sampleWeek(), ZONE, NOW)).toBeNull();
  });

  it('returns null when the extraction found nothing after all', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      times: { slots: [], recurring: [], unreadable: [] },
    });
    expect(await checkQuestionSchedule(QUESTION, sampleWeek(), ZONE, NOW)).toBeNull();
  });

  // The response crossed a port as JSON; the type on it is a claim, not a check.
  it('re-validates the worker’s payload rather than trusting the message type', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      times: {
        slots: [
          {
            source: 'the 30th of February',
            date: '2026-02-30',
            start: '17:00',
            end: '18:00',
            zone: 'UTC',
          },
        ],
      },
    });
    const check = await checkQuestionSchedule(QUESTION, sampleWeek(), ZONE, NOW);
    expect(check?.slots).toEqual([]);
    expect(check?.unchecked).toEqual([{ source: 'the 30th of February', reason: 'unreadable' }]);
  });
});
