import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import {
  EXTRACT_NUM_CTX,
  EXTRACT_SYSTEM_PROMPT,
  buildQuestionTimesPrompt,
  normalizeQuestionTimes,
  type QuestionTimes,
} from './question-times';

/**
 * The extraction call, the `draft-answer.ts` shape.
 *
 * Its own module for the same reason that one is: the prompt and its parser are a contract
 * (`question-times.ts`), and the transport around them changes for entirely different reasons.
 *
 * Note what is missing compared with `draftAnswer` — there is no guard here that discards a
 * response. There is nothing to guard against: the failure this path can produce is a *wrong
 * time*, and no property of the JSON reveals one. The defence is downstream instead, in
 * `schedule-check.ts` re-parsing every field and dropping what does not validate, and on screen,
 * where every verdict is printed beside the question's own words that produced it.
 */
export async function extractQuestionTimes(
  config: OllamaConfig,
  question: string,
  // Required, like draftAnswer's: generateStructured has no default timeout, and omitting one
  // pins the service worker on a model that never returns.
  signal: AbortSignal,
  today: Date = new Date(),
): Promise<QuestionTimes> {
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    EXTRACT_SYSTEM_PROMPT,
    buildQuestionTimesPrompt(question, today),
    signal,
    { num_ctx: EXTRACT_NUM_CTX },
  );
  return normalizeQuestionTimes(raw);
}
