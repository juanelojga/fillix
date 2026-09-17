import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import { buildAnswerPrompt, systemPromptFor, type AnswerPromptInput } from './answer-prompt';

/**
 * A cold local model writing three paragraphs genuinely takes this long. Longer than the news
 * summariser's 60s because the prompt is bigger and the answer is not a summary.
 */
export const DRAFT_TIMEOUT_MS = 120_000;

/**
 * Enough for the job context, eight profile sections and the answer.
 *
 * Passed explicitly because Ollama defaults `num_ctx` to 2048 unless the model's Modelfile
 * raises it, and it truncates from the *start* without saying so — which would silently drop
 * the system prompt's anti-invention rules first and leave a fluent, ungrounded answer.
 */
export const DRAFT_NUM_CTX = 8192;

export interface AnswerDraft {
  /** The answer, as the model wrote it. '' when it had nothing true to say. */
  text: string;
  /** The `##` headings it drew on, verbatim. Shown so the user can check the claim. */
  drewOn: string[];
  /** What the question asked about that the profile did not support. */
  gaps: string[];
}

export interface DraftInput extends AnswerPromptInput {
  kind: 'question' | 'pitch';
}

export async function draftAnswer(
  config: OllamaConfig,
  input: DraftInput,
  // Required, not optional: generateStructured has no default timeout, so omitting it pins
  // the service worker and spins the panel forever.
  signal: AbortSignal,
): Promise<AnswerDraft> {
  // Record<string, unknown>, never AnswerDraft: generateStructured's generic is a bare cast
  // over JSON.parse, so claiming the target type here would let a malformed response reach
  // the UI and throw on drewOn.map.
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    systemPromptFor(input.kind),
    buildAnswerPrompt(input),
    signal,
    { num_ctx: DRAFT_NUM_CTX },
  );
  return normalizeAnswerDraft(raw);
}

function stringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** The single place the model's response shape is actually enforced. */
export function normalizeAnswerDraft(raw: Record<string, unknown>): AnswerDraft {
  const text = typeof raw['text'] === 'string' ? raw['text'].trim() : '';
  const drewOn = stringList(raw['drew_on']);
  const gaps = stringList(raw['gaps']);

  /**
   * The guard the whole feature turns on. An answer with no cited heading is one the model
   * wrote out of its own training rather than out of the applicant's profile — which is
   * exactly the fabrication this design exists to prevent, and it arrives looking confident
   * and well-written. Failing here costs one re-draft; letting it through costs a claim of
   * experience the applicant does not have, in front of a recruiter.
   *
   * An empty answer with no citations is fine: that is the model correctly finding nothing.
   */
  if (text && drewOn.length === 0) {
    throw new Error('The model answered without citing your profile, so the answer was discarded');
  }

  return { text, drewOn, gaps };
}
