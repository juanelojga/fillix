import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { OllamaConfig } from '../../src/types';
import type { EmbedConfig } from '../../src/lib/ollama-embed';

/**
 * The run's configuration: what `eval/profile/ollama.json` says, with environment overrides.
 *
 * Overridable because comparing two models on one golden set is the point of having one —
 * `EVAL_MODEL=gemma4:12b pnpm eval` against the committed default is the whole comparison, and
 * making that edit a file change would put it in a diff where it does not belong.
 */
export interface EvalConfig {
  chat: OllamaConfig;
  embed: EmbedConfig;
  /** How many times each question is drafted. Model output varies; one sample is an anecdote. */
  samples: number;
}

const ROOT = path.resolve('eval');

export function loadEvalConfig(): EvalConfig {
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'profile/ollama.json'), 'utf8')) as {
    baseUrl: string;
    model: string;
    embedModel: string;
  };

  const baseUrl = process.env['EVAL_BASE_URL'] ?? raw.baseUrl;
  const model = process.env['EVAL_MODEL'] ?? raw.model;
  const embedModel = process.env['EVAL_EMBED_MODEL'] ?? raw.embedModel;

  if (!model)
    throw new Error('No chat model: set "model" in eval/profile/ollama.json or EVAL_MODEL');
  if (!embedModel) throw new Error('No embed model: set "embedModel" or EVAL_EMBED_MODEL');

  return {
    chat: { baseUrl, model },
    embed: { baseUrl, model: embedModel },
    samples: Number(process.env['EVAL_SAMPLES'] ?? 1),
  };
}

export function profilePath(file: string): string {
  return path.join(ROOT, 'profile', file);
}
