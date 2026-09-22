import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import { buildNotePrompt, noteSystemPrompt, NOTE_VARIANT_COUNT } from './note-prompt';

/**
 * One round trip: the seed and the standing instructions in, three messages out.
 *
 * Its own budgets rather than `linkedin/post-budget.ts`'s: those are sized against a 4 kB
 * research block this prompt never carries, and importing them would tie two features'
 * arithmetic together for no reason.
 */

/**
 * Instructions ~2 kB plus the seed and the rules is ~1,100 tokens, plus the prediction below
 * — too close to the 2048 Ollama defaults to and truncates from the *start* of, which is
 * where the Spanish rule and the instructions sit. And an override can run longer.
 */
export const NOTE_NUM_CTX = 4_096;

/**
 * Three messages of 2–5 sentences in Spanish, which tokenises at roughly 1.5 tokens a word,
 * is ~450 tokens plus the envelope. 512 is within a rambling model's reach of the cut-off
 * path; the headroom costs nothing.
 */
export const NOTE_NUM_PREDICT = 768;

/** Cold model load dominates, not output length — the `suggest-topics.ts` figure. */
export const NOTE_TIMEOUT_MS = 60_000;

export async function writeNoteVariants(
  config: OllamaConfig,
  seed: string,
  instructions: string,
  // Required, not optional: `generateStructured` has no default timeout, so omitting it pins
  // the service worker and spins the panel forever.
  signal: AbortSignal,
): Promise<string[]> {
  // Record<string, unknown>, never string[]: `generateStructured`'s generic is a bare cast
  // over JSON.parse, so claiming the target type here would let a malformed response reach
  // the panel and render a number as a message.
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    noteSystemPrompt(instructions),
    buildNotePrompt(seed),
    signal,
    { num_ctx: NOTE_NUM_CTX, num_predict: NOTE_NUM_PREDICT },
  );
  return normalizeNoteVariants(raw);
}

/** Case- and whitespace-insensitive, so two rewordings that differ only in spacing are one. */
function textKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The single place the model's response shape is enforced. A row that is not a non-empty
 * string is dropped and the others stand; duplicates are dropped because a small model asked
 * for three different angles regularly emits the same one twice.
 */
export function normalizeNoteVariants(raw: Record<string, unknown>): string[] {
  const rows = Array.isArray(raw['messages']) ? raw['messages'] : [];
  const seen = new Set<string>();
  const messages: string[] = [];

  for (const row of rows) {
    if (typeof row !== 'string') continue;
    const text = row.trim();
    if (!text) continue;

    const key = textKey(text);
    if (seen.has(key)) continue;
    seen.add(key);

    messages.push(text);
    if (messages.length === NOTE_VARIANT_COUNT) break;
  }

  // Throwing rather than returning [] — an empty list is indistinguishable from "the model had
  // nothing to say", which is not what happened. `note-diagnostics.ts` matches this line.
  if (messages.length === 0) {
    throw new Error('The model returned no usable messages');
  }

  return messages;
}
