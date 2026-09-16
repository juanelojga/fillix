/**
 * One-time purges of retired `chrome.storage.local` keys, run on install and startup.
 *
 * Each retirement gets its own function and its own gate: they belong to different
 * epochs and become deletable at different times, so folding them together would
 * mean one cannot be removed without untangling the other.
 */

type LegacyProvider = { provider?: string; baseUrl?: string; model?: string };
type LegacyFavorites = Record<string, string[] | undefined>;

const LEGACY_KEYS = ['provider', 'providerConfigs', 'favoriteModels'];
const RETIRED_OBSIDIAN_KEYS = ['obsidian', 'workflowsFolder', 'workflows'];

/**
 * Cleans up the multi-provider era (`provider`, `providerConfigs`, `favoriteModels`).
 * Fillix is Ollama-only now, so any OpenAI/OpenRouter/custom config — and every API
 * key it held — is dropped rather than carried forward.
 *
 * Idempotent: once the legacy keys are gone this is a no-op.
 */
export async function migrateLegacyProviderKeys(): Promise<void> {
  const stored = await chrome.storage.local.get([...LEGACY_KEYS, 'ollama', 'models']);
  const hasLegacy = LEGACY_KEYS.some((key) => stored[key] !== undefined);
  if (!hasLegacy) return;

  const legacy = (stored.provider as LegacyProvider | undefined) ?? {};
  const isOllama = legacy.provider === 'ollama';
  const next: Record<string, unknown> = {};

  // Only an Ollama config is worth keeping; anything else came with an API key.
  if (stored.ollama === undefined && isOllama && legacy.baseUrl && legacy.model) {
    next.ollama = { baseUrl: legacy.baseUrl, model: legacy.model };
  }

  if (stored.models === undefined) {
    const favorites = (stored.favoriteModels as LegacyFavorites | undefined) ?? {};
    const seeded = [...(favorites.ollama ?? [])];
    const activeModel = isOllama ? legacy.model : undefined;
    if (activeModel && !seeded.includes(activeModel)) seeded.push(activeModel);
    if (seeded.length > 0) next.models = seeded;
  }

  // Read before remove — `next` is derived from the keys we are about to drop.
  if (Object.keys(next).length > 0) await chrome.storage.local.set(next);
  await chrome.storage.local.remove(LEGACY_KEYS);
}

/**
 * Drops the retired `search` key, which held the Brave Search API key for the removed
 * `web_search` tool. Deleting it means the credential does not outlive the feature.
 *
 * Gated on a read so a profile that never had one performs no storage writes.
 */
export async function removeRetiredSearchKey(): Promise<void> {
  const { search } = await chrome.storage.local.get(['search']);
  if (search === undefined) return;
  await chrome.storage.local.remove(['search']);
}

/**
 * Drops the keys of the Obsidian era (`obsidian`, `workflowsFolder`, `workflows`).
 * The vault integration and the workflow-driven pipeline are gone; `obsidian` held
 * the local REST API key, so — as with `search` — the credential must not outlive
 * the feature that needed it.
 *
 * Note this deliberately leaves `chat` alone: a system-prompt override the user
 * typed is still honoured, it just falls back to the packaged default when blank.
 */
export async function removeRetiredObsidianKeys(): Promise<void> {
  const stored = await chrome.storage.local.get(RETIRED_OBSIDIAN_KEYS);
  if (RETIRED_OBSIDIAN_KEYS.every((key) => stored[key] === undefined)) return;
  await chrome.storage.local.remove(RETIRED_OBSIDIAN_KEYS);
}
