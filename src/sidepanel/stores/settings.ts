import { writable, get } from 'svelte/store';
import type { MessageResponse, OllamaConfig, SearchConfig } from '../../types';
import {
  getOllamaConfig,
  setOllamaConfig,
  getSearchConfig,
  setSearchConfig,
  getModelList,
  setModelList,
} from '../../lib/storage';

export const ollamaConfig = writable<OllamaConfig | null>(null);
export const searchConfig = writable<SearchConfig | null>(null);
/** The hand-maintained model list — never populated from /api/tags. */
export const modelList = writable<string[]>([]);

export type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export async function loadSettings(): Promise<void> {
  const [ollama, search, models] = await Promise.all([
    getOllamaConfig(),
    getSearchConfig(),
    getModelList(),
  ]);
  ollamaConfig.set(ollama);
  searchConfig.set(search);
  // An existing install has a model but no list yet — seed it so the picker isn't empty.
  modelList.set(models.length === 0 && ollama.model ? [ollama.model] : models);
}

export async function saveSettings(
  newOllamaConfig: OllamaConfig,
  newSearchConfig: SearchConfig,
): Promise<void> {
  await Promise.all([setOllamaConfig(newOllamaConfig), setSearchConfig(newSearchConfig)]);
  ollamaConfig.set(newOllamaConfig);
  searchConfig.set(newSearchConfig);
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
