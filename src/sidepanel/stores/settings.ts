import { writable, get } from 'svelte/store';
import type { MessageResponse, ProviderConfig, ProviderType, SearchConfig } from '../../types';
import type { FavoriteModels, ProviderConfigs } from '../../lib/storage';
import {
  getProviderConfig,
  setProviderConfig,
  getSearchConfig,
  setSearchConfig,
  getFavoriteModels,
  setFavoriteModels,
  getProviderConfigs,
  setProviderConfigs,
} from '../../lib/storage';

export const providerConfig = writable<ProviderConfig | null>(null);
export const searchConfig = writable<SearchConfig | null>(null);
export const modelList = writable<string[]>([]);
export const favoriteModels = writable<FavoriteModels>({});
export const providerConfigs = writable<ProviderConfigs>({});

export async function loadSettings(): Promise<void> {
  const [provider, search, favorites, configs] = await Promise.all([
    getProviderConfig(),
    getSearchConfig(),
    getFavoriteModels(),
    getProviderConfigs(),
  ]);
  providerConfig.set(provider);
  searchConfig.set(search);
  favoriteModels.set(favorites);
  const seededConfigs: ProviderConfigs =
    Object.keys(configs).length === 0 ? { [provider.provider]: provider } : configs;
  providerConfigs.set(seededConfigs);
}

export async function saveSettings(
  newProviderConfig: ProviderConfig,
  newSearchConfig: SearchConfig,
): Promise<void> {
  const currentConfigs = get(providerConfigs);
  const updatedConfigs: ProviderConfigs = {
    ...currentConfigs,
    [newProviderConfig.provider]: newProviderConfig,
  };
  await Promise.all([
    setProviderConfig(newProviderConfig),
    setSearchConfig(newSearchConfig),
    setProviderConfigs(updatedConfigs),
  ]);
  providerConfig.set(newProviderConfig);
  searchConfig.set(newSearchConfig);
  providerConfigs.set(updatedConfigs);
}

export async function refreshModels(config: ProviderConfig): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'LIST_MODELS',
      config,
    })) as MessageResponse | undefined;
    if (response?.ok && 'models' in response) {
      modelList.set(response.models);
    }
  } catch {
    // service worker unavailable — model list stays as-is
  }
}

export async function toggleFavorite(model: string, provider: ProviderType): Promise<void> {
  const current = get(favoriteModels);
  const providerFavs = current[provider] ?? [];
  const updated: FavoriteModels = {
    ...current,
    [provider]: providerFavs.includes(model)
      ? providerFavs.filter((m) => m !== model)
      : [...providerFavs, model],
  };
  await setFavoriteModels(updated);
  favoriteModels.set(updated);
}

export function filterModels(query: string, allModels: string[]): string[] {
  if (!query.trim()) return allModels;
  const lower = query.toLowerCase();
  return allModels.filter((m) => m.toLowerCase().includes(lower));
}
