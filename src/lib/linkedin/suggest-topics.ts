import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import { POST_NUM_CTX } from './post-budget';
import { isPillar, type PillarId } from './post-taxonomy';
import { buildTopicsPrompt, topicsSystemPrompt, TOPIC_COUNT } from './topics-prompt';

/**
 * Stage 1: five post topics, each tied to a pillar.
 *
 * A summariser-sized generation, not a draft-sized one — five short pairs of lines, so the
 * budgets are `news/summarizer.ts`'s rather than `answers/draft-answer.ts`'s.
 */

export const TOPICS_NUM_PREDICT = 512;
export const TOPICS_TIMEOUT_MS = 60_000;

export interface TopicSuggestion {
  title: string;
  angle: string;
  pillar: PillarId;
}

export async function suggestTopics(
  config: OllamaConfig,
  seed: string,
  voiceSpec: string,
  // Required, not optional: `generateStructured` has no default timeout, so omitting it pins
  // the service worker and spins the panel forever.
  signal: AbortSignal,
): Promise<TopicSuggestion[]> {
  // Record<string, unknown>, never TopicSuggestion[]: `generateStructured`'s generic is a bare
  // cast over JSON.parse, so claiming the target type here would let a malformed response reach
  // the panel and throw on a `.pillar` that is a number.
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    topicsSystemPrompt(voiceSpec),
    buildTopicsPrompt(seed),
    signal,
    { num_ctx: POST_NUM_CTX, num_predict: TOPICS_NUM_PREDICT },
  );
  return normalizeTopicSuggestions(raw);
}

/** Case- and whitespace-insensitive, so "Boring tech ships" and "boring tech ships " are one. */
function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The single place the model's response shape is enforced.
 *
 * An unknown `pillar` is **rejected, never repaired**. Case-folding or prefix-matching
 * "Architecture & System Design" onto `architecture` would be easy and wrong: a model that
 * wrote the label did not read the id list it was given twice, and quietly accepting it means
 * the next field it invents is accepted too. The item is dropped and the others stand.
 *
 * Duplicates are dropped for a plainer reason: a small model asked for five distinct subjects
 * regularly emits the same one twice, and two identical rows in the picker read as a bug.
 */
export function normalizeTopicSuggestions(raw: Record<string, unknown>): TopicSuggestion[] {
  const rows = Array.isArray(raw['topics']) ? raw['topics'] : [];
  const seen = new Set<string>();
  const topics: TopicSuggestion[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const item = row as Record<string, unknown>;

    const title = typeof item['title'] === 'string' ? item['title'].trim() : '';
    const angle = typeof item['angle'] === 'string' ? item['angle'].trim() : '';
    if (!title || !angle || !isPillar(item['pillar'])) continue;

    const key = titleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);

    topics.push({ title, angle, pillar: item['pillar'] });
    if (topics.length === TOPIC_COUNT) break;
  }

  // Throwing rather than returning [] — an empty list is indistinguishable from "the model had
  // no ideas", which is not what happened and not something to put on screen.
  // `post-diagnostics.ts` matches this first line.
  if (topics.length === 0) {
    throw new Error('The model returned no usable topics');
  }

  return topics;
}
