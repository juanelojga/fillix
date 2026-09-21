import type { NewsSummary, OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';

/** A cold local model on CPU genuinely takes this long to first token; testModel's
 *  30s is too tight here because a full article is a much larger prompt. */
export const SUMMARY_TIMEOUT_MS = 60_000;

/**
 * Stated for the same reason `answers/draft-answer.ts` states its pair, and overdue here: this
 * path sent no options at all, so it has been running at Ollama's 2048-token default the whole
 * time. `fetch-url.ts` caps an article at 3,000 characters, which with the title and the system
 * prompt leaves the 2048 barely enough — and an overflow is truncated from the *start*, eating the
 * "use ONLY the article text" rule before anything else.
 */
export const SUMMARY_NUM_CTX = 4_096;

/** Two to four sentences plus at most three key points. Bounds a model that starts repeating. */
export const SUMMARY_NUM_PREDICT = 512;

const MAX_KEY_POINTS = 3;

const SUMMARY_SYSTEM_PROMPT = [
  'You summarize one news article for a reader who has not opened it.',
  'Use ONLY the article text provided. Never add facts, context, or opinions from your own knowledge.',
  'The text may be truncated mid-sentence; ignore the trailing fragment.',
  'If the text does not contain a readable article, set summary to an empty string.',
  'Respond with JSON only: {"summary":"<2-4 sentences>","key_points":["<point>"]}',
  'summary is plain prose — no markdown, no headings, no preamble.',
  `key_points: 0 to ${MAX_KEY_POINTS} items, each under 120 characters.`,
].join('\n');

export interface SummarizeInput {
  title: string;
  source: string;
  text: string;
}

export async function summarizeArticle(
  config: OllamaConfig,
  input: SummarizeInput,
  // Required, not optional: generateStructured has no default timeout, so omitting
  // this pins the service worker and spins the panel forever.
  signal: AbortSignal,
): Promise<NewsSummary> {
  const userPrompt = [
    `Title: ${input.title}`,
    `Source: ${input.source}`,
    '',
    'Article text:',
    input.text,
  ].join('\n');

  // Record<string, unknown>, never NewsSummary: generateStructured's generic is a pure
  // cast over JSON.parse, so claiming NewsSummary here would let a malformed response
  // reach the UI and throw on keyPoints.map.
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    SUMMARY_SYSTEM_PROMPT,
    userPrompt,
    signal,
    { num_ctx: SUMMARY_NUM_CTX, num_predict: SUMMARY_NUM_PREDICT },
  );
  return normalizeNewsSummary(raw);
}

/** The single place the model's response shape is actually enforced. */
export function normalizeNewsSummary(raw: Record<string, unknown>): NewsSummary {
  const summary = typeof raw['summary'] === 'string' ? raw['summary'].trim() : '';
  if (!summary) throw new Error('Model returned no usable summary');

  const rawPoints: unknown = raw['key_points'];
  const keyPoints = (Array.isArray(rawPoints) ? rawPoints : [])
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, MAX_KEY_POINTS);

  return { summary, keyPoints };
}
