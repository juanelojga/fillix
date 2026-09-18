import type { Message, MessageResponse } from '../../types';

/**
 * The `EXTRACT_QUESTION_TIMES` round trip, as its own module.
 *
 * Transport is its own reason to change — a worker that can be suspended, a panel that can be
 * closed — and keeping it here is what lets `question-schedule.ts` be a pure function of the
 * times it is handed.
 *
 * It deliberately hands back the **raw record**, not a `QuestionTimes`. `MessageResponse` types
 * that field as already-parsed, but what arrived is JSON that crossed a process boundary, and
 * the caller re-validates it before any number is treated as the applicant's stated
 * availability. Returning the parsed type here would move that decision somewhere it cannot be
 * seen.
 */
export async function requestQuestionTimes(
  question: string,
): Promise<Record<string, unknown> | null> {
  const msg: Message = { type: 'EXTRACT_QUESTION_TIMES', question };

  let response: MessageResponse | undefined;
  try {
    response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
  } catch {
    // A suspended worker or a closed panel. Not worth a diagnosis of its own: the answer is
    // still drafted, just without the check.
    return null;
  }

  if (!response?.ok || !('times' in response)) return null;
  return response.times as unknown as Record<string, unknown>;
}
