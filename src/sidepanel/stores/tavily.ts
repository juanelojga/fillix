import { writable } from 'svelte/store';
import type { MessageResponse } from '../../types';
import type { TavilyKeyStatus } from '../../lib/tavily/search';
import { getTavilyConfig, setTavilyConfig } from '../../lib/storage';

/**
 * The Tavily API key, and the probe that says whether it works.
 *
 * Its own store rather than more of `stores/settings.ts`, which is 160 lines in which every doc
 * comment answers one question — *which model runs this?* A credential with its own round trip is
 * a different question, and the rule in CLAUDE.md is to split before adding to a file that is
 * already at the limit and would then mix concerns. `stores/availability.ts` is the precedent for
 * a tab's secondary concern owning its own store with its own hydrate, which `ProfileTab` already
 * calls alongside another.
 *
 * `''` means web search is off. Nothing here validates the key's shape: as with model names,
 * pressing Test is what tells you whether it works.
 */

export const tavilyApiKey = writable<string>('');

export type TavilyTestResult = { ok: true; status: TavilyKeyStatus } | { ok: false; error: string };

export async function hydrateTavilyKey(): Promise<void> {
  const { apiKey } = await getTavilyConfig();
  tavilyApiKey.set(apiKey);
}

/** Storage first, then the store, as every setter in `stores/settings.ts` does. */
export async function saveTavilyKey(key: string): Promise<void> {
  const trimmed = key.trim();
  await setTavilyConfig({ apiKey: trimmed });
  tavilyApiKey.set(trimmed);
}

export async function clearTavilyKey(): Promise<void> {
  await saveTavilyKey('');
}

/**
 * Runs a real request through the background worker, which is where the key lives. Errors are
 * returned rather than swallowed — the message is the whole point of testing, and
 * `search-diagnostics.ts` turns it into wording at render time.
 */
export async function testTavilyKey(): Promise<TavilyTestResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'TEST_TAVILY',
    })) as MessageResponse | undefined;
    if (response?.ok && 'tavily' in response) return { ok: true, status: response.tavily };
    if (response && !response.ok) return { ok: false, error: response.error };
    return { ok: false, error: 'No response from the extension service worker' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
