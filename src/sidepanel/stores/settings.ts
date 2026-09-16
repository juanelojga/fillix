import { writable, get } from 'svelte/store';
import type { MessageResponse, OllamaConfig } from '../../types';
import {
  getOllamaConfig,
  setOllamaConfig,
  getModelList,
  setModelList,
  getChatConfig,
} from '../../lib/storage';
import {
  setSystemPromptOverride,
  resetSystemPrompt as clearOverride,
} from '../../lib/system-prompt';

export const ollamaConfig = writable<OllamaConfig | null>(null);
/** The hand-maintained model list — never populated from /api/tags. */
export const modelList = writable<string[]>([]);
/** The user's system-prompt override. '' means the packaged default is in use. */
export const systemPromptOverride = writable<string>('');

export type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export async function loadSettings(): Promise<void> {
  const [ollama, models, chat] = await Promise.all([
    getOllamaConfig(),
    getModelList(),
    getChatConfig(),
  ]);
  ollamaConfig.set(ollama);
  systemPromptOverride.set(chat.systemPrompt);
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
}

export async function setActiveModel(name: string): Promise<void> {
  const cfg = get(ollamaConfig);
  if (!cfg || cfg.model === name) return;
  const updated = { ...cfg, model: name };
  await setOllamaConfig(updated);
  ollamaConfig.set(updated);
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
