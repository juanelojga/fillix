import { writable } from 'svelte/store';
import type { ProviderConfig, SearchConfig } from '../../types';

export const providerConfig = writable<ProviderConfig | null>(null);
export const searchConfig = writable<SearchConfig | null>(null);
export const modelList = writable<string[]>([]);
export const favoriteModels = writable<Record<string, string[]>>({});
