import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn();
vi.stubGlobal('chrome', { runtime: { sendMessage } });

import { requestQuestionTimes } from '../question-times-port';

const QUESTION = 'Can you make a call on Tuesday at 5pm CEST?';

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true, times: { mentions: [] } });
});

describe('requestQuestionTimes', () => {
  it('sends the question on EXTRACT_QUESTION_TIMES', async () => {
    await requestQuestionTimes(QUESTION);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'EXTRACT_QUESTION_TIMES',
      question: QUESTION,
      model: undefined,
    });
  });

  // The extraction and the draft must run on the same model the Workflows header names,
  // or a verdict is computed from times a different model read.
  it('carries the model it was given', async () => {
    await requestQuestionTimes(QUESTION, 'phi4');

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXTRACT_QUESTION_TIMES', model: 'phi4' }),
    );
  });

  it("sends no model when given '', so the worker uses the active one", async () => {
    await requestQuestionTimes(QUESTION, '');

    expect(sendMessage.mock.calls[0]?.[0]?.model).toBeUndefined();
  });

  it('returns the raw record unparsed', async () => {
    sendMessage.mockResolvedValue({ ok: true, times: { mentions: [{ start: 'nonsense' }] } });

    expect(await requestQuestionTimes(QUESTION)).toEqual({ mentions: [{ start: 'nonsense' }] });
  });

  // A suspended worker or a closed panel. The answer is still drafted, just without the
  // check — which is why this returns null rather than throwing.
  it('returns null when the port throws', async () => {
    sendMessage.mockRejectedValue(new Error('Could not establish connection'));

    expect(await requestQuestionTimes(QUESTION)).toBeNull();
  });

  it('returns null on a failed response', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'model not found' });

    expect(await requestQuestionTimes(QUESTION)).toBeNull();
  });

  it('returns null when the response carries no times', async () => {
    sendMessage.mockResolvedValue({ ok: true });

    expect(await requestQuestionTimes(QUESTION)).toBeNull();
  });

  it('returns null when there is no response at all', async () => {
    sendMessage.mockResolvedValue(undefined);

    expect(await requestQuestionTimes(QUESTION)).toBeNull();
  });
});
