/**
 * One-time cleanup of the multi-provider era (`provider`, `providerConfigs`,
 * `favoriteModels`). Fillix is Ollama-only now, so any OpenAI/OpenRouter/custom
 * config — and every API key it held — is dropped rather than carried forward.
 *
 * Idempotent: once the legacy keys are gone this is a no-op.
 */

type LegacyProvider = { provider?: string; baseUrl?: string; model?: string };
type LegacyFavorites = Record<string, string[] | undefined>;

const LEGACY_KEYS = ['provider', 'providerConfigs', 'favoriteModels'];

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
