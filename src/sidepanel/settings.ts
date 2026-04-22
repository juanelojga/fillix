import {
  getFavoriteModels,
  getProviderConfig,
  getSearchConfig,
  getWorkflowsFolder,
  setFavoriteModels,
  setOllamaConfig,
  setProviderConfig,
  setSearchConfig,
  setWorkflowsFolder,
} from '../lib/storage';
import type { FavoriteModels } from '../lib/storage';
import type { Message, MessageResponse, ProviderConfig, ProviderType } from '../types';

const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
  openrouter: 'https://openrouter.ai/api',
  custom: '',
};

// Module-scoped state for model list and search filter
let allModels: string[] = [];
let currentProvider: ProviderType = 'ollama';

export async function loadSidepanelSettings(): Promise<void> {
  const folder = await getWorkflowsFolder();
  const input = document.getElementById('workflows-folder') as HTMLInputElement | null;
  if (input) input.value = folder;
}

export async function saveSidepanelSettings(): Promise<void> {
  const input = document.getElementById('workflows-folder') as HTMLInputElement | null;
  const folder = input?.value.trim() || 'fillix-workflows';
  await setWorkflowsFolder(folder);
}

export function updateProviderFieldVisibility(provider: ProviderType): void {
  const baseurlRow = document.getElementById('provider-baseurl-row') as HTMLElement | null;
  const apikeyRow = document.getElementById('provider-apikey-row') as HTMLElement | null;
  if (baseurlRow) baseurlRow.hidden = provider === 'openai' || provider === 'openrouter';
  if (apikeyRow) apikeyRow.hidden = provider === 'ollama';
}

export async function loadProviderSettings(): Promise<void> {
  const [providerConfig, searchConfig] = await Promise.all([
    getProviderConfig(),
    getSearchConfig(),
  ]);

  const providerSelect = document.getElementById('provider-select') as HTMLSelectElement | null;
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement | null;
  const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement | null;
  const braveKeyInput = document.getElementById('brave-apikey') as HTMLInputElement | null;

  if (providerSelect) providerSelect.value = providerConfig.provider;
  if (baseUrlInput) baseUrlInput.value = providerConfig.baseUrl;
  if (apiKeyInput) apiKeyInput.value = providerConfig.apiKey ?? '';
  if (braveKeyInput) braveKeyInput.value = searchConfig.braveApiKey ?? '';

  updateProviderFieldVisibility(providerConfig.provider);
  await refreshModelsFromProvider(providerConfig.model);
}

export async function saveProviderSettings(): Promise<void> {
  const providerSelect = document.getElementById('provider-select') as HTMLSelectElement | null;
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement | null;
  const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement | null;
  const braveKeyInput = document.getElementById('brave-apikey') as HTMLInputElement | null;
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;

  const provider = (providerSelect?.value ?? 'ollama') as ProviderType;
  const baseUrl =
    baseUrlInput?.value.trim() || (provider === 'ollama' ? 'http://localhost:11434' : '');
  const model = modelSelect?.value ?? '';
  const apiKey = apiKeyInput?.value.trim() || undefined;
  const braveApiKey = braveKeyInput?.value.trim() || undefined;

  await Promise.all([
    setProviderConfig({ provider, baseUrl, model, apiKey }),
    setSearchConfig({ braveApiKey }),
  ]);

  if (provider === 'ollama') {
    await setOllamaConfig({ baseUrl, model });
  }
}

function buildLiveConfig(): ProviderConfig {
  const providerSelect = document.getElementById('provider-select') as HTMLSelectElement | null;
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement | null;
  const apiKeyInput = document.getElementById('provider-apikey') as HTMLInputElement | null;

  const provider = (providerSelect?.value ?? 'ollama') as ProviderType;
  const defaultUrl = PROVIDER_DEFAULT_URLS[provider];
  const baseUrl = baseUrlInput?.value.trim() || defaultUrl;
  const apiKey = apiKeyInput?.value.trim() || undefined;

  return { provider, baseUrl, model: '', apiKey };
}

function renderModelSelect(models: string[], favorites: string[], selectedModel?: string): void {
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;
  if (!modelSelect) return;

  modelSelect.innerHTML = '';

  if (favorites.length > 0) {
    const pinnedGroup = document.createElement('optgroup');
    pinnedGroup.label = '★ Pinned';
    for (const m of models.filter((m) => favorites.includes(m))) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) opt.selected = true;
      pinnedGroup.appendChild(opt);
    }
    if (pinnedGroup.children.length > 0) modelSelect.appendChild(pinnedGroup);

    const allGroup = document.createElement('optgroup');
    allGroup.label = 'All models';
    for (const m of models.filter((m) => !favorites.includes(m))) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) opt.selected = true;
      allGroup.appendChild(opt);
    }
    if (allGroup.children.length > 0) modelSelect.appendChild(allGroup);
  } else {
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) opt.selected = true;
      modelSelect.appendChild(opt);
    }
  }
}

export function updateFavoriteButton(favorites: string[], selectedModel: string): void {
  const btn = document.getElementById('toggle-favorite') as HTMLButtonElement | null;
  if (!btn) return;
  const isPinned = favorites.includes(selectedModel);
  btn.textContent = isPinned ? '★ Pinned' : '☆ Pin model';
  btn.classList.toggle('active', isPinned);
}

export async function refreshModelsFromProvider(selectedModel?: string): Promise<void> {
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;
  const statusEl = document.getElementById('settings-status') as HTMLElement | null;
  if (!modelSelect) return;

  const liveConfig = buildLiveConfig();
  currentProvider = liveConfig.provider;

  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'LIST_MODELS',
      config: liveConfig,
    } satisfies Message)) as MessageResponse | undefined;

    if (!res) return;
    if (res.ok && 'models' in res) {
      allModels = res.models;
      const favorites = ((await Promise.resolve(getFavoriteModels()).catch(() => undefined)) ??
        {}) as FavoriteModels;
      const providerFavorites = favorites[currentProvider] ?? [];

      const resolvedSelected = selectedModel ?? modelSelect.value;
      renderModelSelect(allModels, providerFavorites, resolvedSelected);
      updateFavoriteButton(providerFavorites, modelSelect.value);

      if (modelSelect.options.length === 0 && statusEl) {
        statusEl.textContent = 'No models found for this provider.';
        setTimeout(() => (statusEl.textContent = ''), 3000);
      }
    } else if (!res.ok) {
      const errMsg = (res as { ok: false; error: string }).error;
      if (statusEl) {
        statusEl.textContent = errMsg;
        setTimeout(() => (statusEl.textContent = ''), 3000);
      }
    }
  } catch {
    // Silently fail — provider may not be reachable yet.
  }
}

export async function filterModelList(query: string): Promise<void> {
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;
  if (!modelSelect) return;

  const q = query.trim().toLowerCase();
  const filtered = q ? allModels.filter((m) => m.toLowerCase().includes(q)) : allModels;
  const favorites = ((await Promise.resolve(getFavoriteModels()).catch(() => undefined)) ??
    {}) as FavoriteModels;
  const providerFavorites = favorites[currentProvider] ?? [];
  const selected = modelSelect.value;
  renderModelSelect(filtered, providerFavorites, selected);
}

export async function handleToggleFavorite(): Promise<void> {
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;
  const providerSelect = document.getElementById('provider-select') as HTMLSelectElement | null;
  if (!modelSelect || !providerSelect) return;

  const model = modelSelect.value;
  if (!model) return;

  const provider = (providerSelect.value ?? 'ollama') as ProviderType;
  const favorites = await getFavoriteModels();
  const list = favorites[provider] ?? [];
  const updated = list.includes(model) ? list.filter((m) => m !== model) : [...list, model];
  const newFavorites = { ...favorites, [provider]: updated };
  await setFavoriteModels(newFavorites);

  const modelSearchEl = document.getElementById('model-search') as HTMLInputElement | null;
  const query = modelSearchEl?.value ?? '';
  const q = query.trim().toLowerCase();
  const filtered = q ? allModels.filter((m) => m.toLowerCase().includes(q)) : allModels;
  renderModelSelect(filtered, updated, model);
  updateFavoriteButton(updated, model);
}
