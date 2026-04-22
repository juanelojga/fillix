// TODO: Install test runner with: pnpm add -D vitest @vitest/ui jsdom
// Run with: pnpm exec vitest run --environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as StorageModule from '../../lib/storage';

vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    getProviderConfig: vi.fn(),
    setProviderConfig: vi.fn(),
    getSearchConfig: vi.fn(),
    setSearchConfig: vi.fn(),
    getOllamaConfig: vi.fn(),
    setOllamaConfig: vi.fn(),
  };
});

import * as storage from '../../lib/storage';
import type { ProviderConfig, SearchConfig } from '../../types';

// ---------- DOM setup ----------

function buildSettingsDom(): void {
  document.body.innerHTML = `
    <select id="provider-select">
      <option value="ollama">Ollama</option>
      <option value="openai">OpenAI</option>
      <option value="openrouter">OpenRouter</option>
      <option value="custom">Custom</option>
    </select>
    <div id="provider-baseurl-row">
      <input id="baseUrl" type="url" value="http://localhost:11434" />
    </div>
    <div id="provider-apikey-row">
      <input id="provider-apikey" type="password" />
    </div>
    <div id="search-apikey-row">
      <input id="brave-apikey" type="password" />
    </div>
    <select id="model"><option value="llama3.2">llama3.2</option></select>
    <button id="refreshModels">Refresh</button>
    <div id="settings-status"></div>
  `;
}

const ollamaProvider: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

const openaiProvider: ProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  apiKey: 'sk-test',
};

const defaultSearch: SearchConfig = {};

// ---------- updateProviderFieldVisibility ----------

describe('updateProviderFieldVisibility', () => {
  beforeEach(() => {
    buildSettingsDom();
    vi.resetAllMocks();
  });

  it('hides apikey row and shows baseurl row for ollama', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('ollama');
    const apikeyRow = document.getElementById('provider-apikey-row') as HTMLElement;
    const baseurlRow = document.getElementById('provider-baseurl-row') as HTMLElement;
    expect(apikeyRow.hidden).toBe(true);
    expect(baseurlRow.hidden).toBe(false);
  });

  it('shows apikey row and hides baseurl row for openai', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('openai');
    const apikeyRow = document.getElementById('provider-apikey-row') as HTMLElement;
    const baseurlRow = document.getElementById('provider-baseurl-row') as HTMLElement;
    expect(apikeyRow.hidden).toBe(false);
    expect(baseurlRow.hidden).toBe(true);
  });

  it('shows apikey row and hides baseurl row for openrouter', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('openrouter');
    const apikeyRow = document.getElementById('provider-apikey-row') as HTMLElement;
    expect(apikeyRow.hidden).toBe(false);
    expect(document.getElementById('provider-baseurl-row')!.hidden).toBe(true);
  });

  it('shows both apikey row and baseurl row for custom', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('custom');
    const apikeyRow = document.getElementById('provider-apikey-row') as HTMLElement;
    const baseurlRow = document.getElementById('provider-baseurl-row') as HTMLElement;
    expect(apikeyRow.hidden).toBe(false);
    expect(baseurlRow.hidden).toBe(false);
  });
});

// ---------- loadProviderSettings ----------

describe('loadProviderSettings', () => {
  beforeEach(() => {
    buildSettingsDom();
    vi.resetAllMocks();
  });

  it('populates fields from ollama provider config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(ollamaProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue(defaultSearch);
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    const select = document.getElementById('provider-select') as HTMLSelectElement;
    expect(select.value).toBe('ollama');
    const baseUrl = document.getElementById('baseUrl') as HTMLInputElement;
    expect(baseUrl.value).toBe('http://localhost:11434');
  });

  it('populates apikey field from openai provider config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(openaiProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue(defaultSearch);
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    const select = document.getElementById('provider-select') as HTMLSelectElement;
    expect(select.value).toBe('openai');
    const apiKey = document.getElementById('provider-apikey') as HTMLInputElement;
    expect(apiKey.value).toBe('sk-test');
  });

  it('populates brave api key from search config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(ollamaProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({ braveApiKey: 'brave-123' });
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    const braveKey = document.getElementById('brave-apikey') as HTMLInputElement;
    expect(braveKey.value).toBe('brave-123');
  });
});

// ---------- saveProviderSettings ----------

describe('saveProviderSettings', () => {
  beforeEach(() => {
    buildSettingsDom();
    vi.resetAllMocks();
    vi.mocked(storage.setProviderConfig).mockResolvedValue(undefined);
    vi.mocked(storage.setSearchConfig).mockResolvedValue(undefined);
    vi.mocked(storage.setOllamaConfig).mockResolvedValue(undefined);
  });

  it('calls setProviderConfig with values from form for openai', async () => {
    const select = document.getElementById('provider-select') as HTMLSelectElement;
    select.value = 'openai';
    const apiKey = document.getElementById('provider-apikey') as HTMLInputElement;
    apiKey.value = 'sk-abc';
    const baseUrl = document.getElementById('baseUrl') as HTMLInputElement;
    baseUrl.value = 'https://api.openai.com';
    const model = document.getElementById('model') as HTMLSelectElement;
    model.innerHTML = '<option value="gpt-4o" selected>gpt-4o</option>';

    const { saveProviderSettings } = await import('../settings');
    await saveProviderSettings();

    expect(storage.setProviderConfig).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'sk-abc' }),
    );
    expect(storage.setOllamaConfig).not.toHaveBeenCalled();
  });

  it('also calls setOllamaConfig when provider is ollama', async () => {
    const select = document.getElementById('provider-select') as HTMLSelectElement;
    select.value = 'ollama';
    const baseUrl = document.getElementById('baseUrl') as HTMLInputElement;
    baseUrl.value = 'http://localhost:11434';
    const model = document.getElementById('model') as HTMLSelectElement;
    model.innerHTML = '<option value="llama3.2" selected>llama3.2</option>';

    const { saveProviderSettings } = await import('../settings');
    await saveProviderSettings();

    expect(storage.setOllamaConfig).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
    );
  });

  it('saves brave api key to search config', async () => {
    const select = document.getElementById('provider-select') as HTMLSelectElement;
    select.value = 'ollama';
    const braveKey = document.getElementById('brave-apikey') as HTMLInputElement;
    braveKey.value = 'brave-xyz';
    const model = document.getElementById('model') as HTMLSelectElement;
    model.innerHTML = '<option value="llama3.2" selected>llama3.2</option>';

    const { saveProviderSettings } = await import('../settings');
    await saveProviderSettings();

    expect(storage.setSearchConfig).toHaveBeenCalledWith(
      expect.objectContaining({ braveApiKey: 'brave-xyz' }),
    );
  });
});

// ---------- refreshModelsFromProvider ----------

describe('refreshModelsFromProvider', () => {
  beforeEach(() => {
    buildSettingsDom();
    vi.resetAllMocks();
  });

  it('sends LIST_MODELS and populates model select on success', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, models: ['gpt-4o', 'gpt-3.5'] });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendMessage, id: 'test-ext-id' } });

    const { refreshModelsFromProvider } = await import('../settings');
    await refreshModelsFromProvider();

    const model = document.getElementById('model') as HTMLSelectElement;
    expect(model.options.length).toBe(2);
    expect(model.options[0].value).toBe('gpt-4o');
  });

  it('shows error in settings-status on failure', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: false, error: 'Connection refused' });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendMessage, id: 'test-ext-id' } });

    const { refreshModelsFromProvider } = await import('../settings');
    await refreshModelsFromProvider();

    const status = document.getElementById('settings-status') as HTMLElement;
    expect(status.textContent).toContain('Connection refused');
  });
});
