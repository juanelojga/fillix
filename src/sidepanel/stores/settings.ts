import { writable, derived, get } from 'svelte/store';
import type { MessageResponse, OllamaConfig } from '../../types';
import {
  getOllamaConfig,
  setOllamaConfig,
  getModelList,
  setModelList,
  getChatConfig,
  getNewsConfig,
  setNewsConfig,
} from '../../lib/storage';
import { resolveSummaryModel } from '../../lib/news/summary-model';
import {
  setSystemPromptOverride,
  resetSystemPrompt as clearOverride,
} from '../../lib/system-prompt';

export const ollamaConfig = writable<OllamaConfig | null>(null);
/** The hand-maintained model list — never populated from /api/tags. */
export const modelList = writable<string[]>([]);
/** The user's system-prompt override. '' means the packaged default is in use. */
export const systemPromptOverride = writable<string>('');
/** The News tab's summary model. '' means "same as chat", i.e. the active model. */
export const newsModel = writable<string>('');

/**
 * What will actually run for News summaries. The single source of truth for both the
 * picker's trigger label and the model sent on NEWS_SUMMARIZE, so the two cannot drift.
 */
export const effectiveSummaryModel = derived([newsModel, ollamaConfig], ([pref, cfg]) =>
  resolveSummaryModel(pref, cfg?.model ?? ''),
);

export type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export async function loadSettings(): Promise<void> {
  const [ollama, models, chat, news] = await Promise.all([
    getOllamaConfig(),
    getModelList(),
    getChatConfig(),
    getNewsConfig(),
  ]);
  ollamaConfig.set(ollama);
  systemPromptOverride.set(chat.systemPrompt);
  newsModel.set(news.model);
  // An existing install has a model but no list yet — seed it so the picker isn't empty.
  modelList.set(models.length === 0 && ollama.model ? [ollama.model] : models);
}

export async function saveSettings(newOllamaConfig: OllamaConfig): Promise<void> {
  await setOllamaConfig(newOllamaConfig);
  ollamaConfig.set(newOllamaConfig);
}

export async function addModel(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = get(modelList);
  if (current.includes(trimmed)) return;
  const updated = [...current, trimmed];
  await setModelList(updated);
  modelList.set(updated);
  // First model added becomes the active one.
  if (!get(ollamaConfig)?.model) await setActiveModel(trimmed);
}

export async function removeModel(name: string): Promise<void> {
  const updated = get(modelList).filter((m) => m !== name);
  await setModelList(updated);
  modelList.set(updated);
  if (get(ollamaConfig)?.model === name) await setActiveModel(updated[0] ?? '');
  // Back to "same as chat", not updated[0]: the active model must always name something,
  // but the News preference has a real empty state, and silently promoting a model the
  // user never picked for summaries would be worse than falling back visibly.
  if (get(newsModel) === name) await setNewsModel('');
}

export async function setActiveModel(name: string): Promise<void> {
  const cfg = get(ollamaConfig);
  if (!cfg || cfg.model === name) return;
  const updated = { ...cfg, model: name };
  await setOllamaConfig(updated);
  ollamaConfig.set(updated);
}

/** '' is a meaningful value here: it puts the News tab back on the active model. */
export async function setNewsModel(name: string): Promise<void> {
  if (get(newsModel) === name) return;
  await setNewsConfig({ model: name });
  newsModel.set(name);
}

/**
 * Runs a real one-token generation through the background worker. Errors are
 * returned rather than swallowed — the message is the whole point of testing.
 */
export async function testModel(name: string): Promise<TestResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'TEST_MODEL',
      model: name,
    })) as MessageResponse | undefined;
    if (response?.ok && 'latencyMs' in response) return { ok: true, latencyMs: response.latencyMs };
    if (response && !response.ok) return { ok: false, error: response.error };
    return { ok: false, error: 'No response from the extension service worker' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Persists an override. A blank value is stored as '', i.e. back to the default. */
export async function saveSystemPrompt(text: string): Promise<void> {
  await setSystemPromptOverride(text);
  systemPromptOverride.set(text.trim());
}

export async function resetSystemPrompt(): Promise<void> {
  await clearOverride();
  systemPromptOverride.set('');
}
