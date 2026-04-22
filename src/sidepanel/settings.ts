import {
  getProviderConfig,
  getSearchConfig,
  getWorkflowsFolder,
  setOllamaConfig,
  setProviderConfig,
  setSearchConfig,
  setWorkflowsFolder,
} from '../lib/storage';
import type { Message, MessageResponse, ProviderType } from '../types';

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
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;

  if (providerSelect) providerSelect.value = providerConfig.provider;
  if (baseUrlInput) baseUrlInput.value = providerConfig.baseUrl;
  if (apiKeyInput) apiKeyInput.value = providerConfig.apiKey ?? '';
  if (braveKeyInput) braveKeyInput.value = searchConfig.braveApiKey ?? '';
  if (modelSelect && providerConfig.model) {
    const existing = Array.from(modelSelect.options).find((o) => o.value === providerConfig.model);
    if (existing) existing.selected = true;
  }

  updateProviderFieldVisibility(providerConfig.provider);
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

export async function refreshModelsFromProvider(selectedModel?: string): Promise<void> {
  const modelSelect = document.getElementById('model') as HTMLSelectElement | null;
  const statusEl = document.getElementById('settings-status') as HTMLElement | null;
  if (!modelSelect) return;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'LIST_MODELS',
    } satisfies Message)) as MessageResponse;
    if (res.ok && 'models' in res) {
      modelSelect.innerHTML = '';
      for (const m of res.models) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === selectedModel) opt.selected = true;
        modelSelect.appendChild(opt);
      }
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
