// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run --environment jsdom
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSidepanelSettings, saveSidepanelSettings } from '../settings';
import type * as StorageModule from '../../lib/storage';

const mockGetWorkflowsFolder = vi.hoisted(() => vi.fn());
const mockSetWorkflowsFolder = vi.hoisted(() => vi.fn());

vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    getWorkflowsFolder: mockGetWorkflowsFolder,
    setWorkflowsFolder: mockSetWorkflowsFolder,
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

function buildDOM(): void {
  document.body.innerHTML = `
    <input id="workflows-folder" type="text" />
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

// ---------- loadSidepanelSettings / saveSidepanelSettings ----------

describe('loadSidepanelSettings — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildDOM();
  });

  it('populates #workflows-folder input from getWorkflowsFolder()', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('my-custom-folder');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'my-custom-folder',
    );
  });

  it('shows "fillix-workflows" as the value when storage returns the default', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('fillix-workflows');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'fillix-workflows',
    );
  });

  it('sets value to empty string if getWorkflowsFolder returns empty', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe('');
  });
});

describe('saveSidepanelSettings — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSetWorkflowsFolder.mockResolvedValue(undefined);
    buildDOM();
  });

  it('calls setWorkflowsFolder with the trimmed input value on save', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '  custom-wf  ';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('custom-wf');
  });

  it('calls setWorkflowsFolder with the default value when input is empty', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('fillix-workflows');
  });

  it('persists the workflows folder path when save is triggered', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = 'sprints';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledOnce();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('sprints');
  });
});

// ---------- updateProviderFieldVisibility ----------

describe('updateProviderFieldVisibility', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetAllMocks();
  });

  it('hides apikey row and shows baseurl row for ollama', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('ollama');
    expect((document.getElementById('provider-apikey-row') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('provider-baseurl-row') as HTMLElement).hidden).toBe(false);
  });

  it('shows apikey row and hides baseurl row for openai', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('openai');
    expect((document.getElementById('provider-apikey-row') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('provider-baseurl-row') as HTMLElement).hidden).toBe(true);
  });

  it('shows apikey row and hides baseurl row for openrouter', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('openrouter');
    expect((document.getElementById('provider-apikey-row') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('provider-baseurl-row') as HTMLElement).hidden).toBe(true);
  });

  it('shows both apikey row and baseurl row for custom', async () => {
    const { updateProviderFieldVisibility } = await import('../settings');
    updateProviderFieldVisibility('custom');
    expect((document.getElementById('provider-apikey-row') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('provider-baseurl-row') as HTMLElement).hidden).toBe(false);
  });
});

// ---------- loadProviderSettings ----------

describe('loadProviderSettings', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetAllMocks();
  });

  it('populates fields from ollama provider config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(ollamaProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue(defaultSearch);
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    expect((document.getElementById('provider-select') as HTMLSelectElement).value).toBe('ollama');
    expect((document.getElementById('baseUrl') as HTMLInputElement).value).toBe(
      'http://localhost:11434',
    );
  });

  it('populates apikey field from openai provider config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(openaiProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue(defaultSearch);
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    expect((document.getElementById('provider-select') as HTMLSelectElement).value).toBe('openai');
    expect((document.getElementById('provider-apikey') as HTMLInputElement).value).toBe('sk-test');
  });

  it('populates brave api key from search config', async () => {
    vi.mocked(storage.getProviderConfig).mockResolvedValue(ollamaProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({ braveApiKey: 'brave-123' });
    const { loadProviderSettings } = await import('../settings');
    await loadProviderSettings();
    expect((document.getElementById('brave-apikey') as HTMLInputElement).value).toBe('brave-123');
  });
});

// ---------- saveProviderSettings ----------

describe('saveProviderSettings', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetAllMocks();
    vi.mocked(storage.setProviderConfig).mockResolvedValue(undefined);
    vi.mocked(storage.setSearchConfig).mockResolvedValue(undefined);
    vi.mocked(storage.setOllamaConfig).mockResolvedValue(undefined);
  });

  it('calls setProviderConfig with values from form for openai', async () => {
    (document.getElementById('provider-select') as HTMLSelectElement).value = 'openai';
    (document.getElementById('provider-apikey') as HTMLInputElement).value = 'sk-abc';
    (document.getElementById('baseUrl') as HTMLInputElement).value = 'https://api.openai.com';
    (document.getElementById('model') as HTMLSelectElement).innerHTML =
      '<option value="gpt-4o" selected>gpt-4o</option>';

    const { saveProviderSettings } = await import('../settings');
    await saveProviderSettings();

    expect(storage.setProviderConfig).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'sk-abc' }),
    );
    expect(storage.setOllamaConfig).not.toHaveBeenCalled();
  });

  it('also calls setOllamaConfig when provider is ollama', async () => {
    (document.getElementById('provider-select') as HTMLSelectElement).value = 'ollama';
    (document.getElementById('baseUrl') as HTMLInputElement).value = 'http://localhost:11434';
    (document.getElementById('model') as HTMLSelectElement).innerHTML =
      '<option value="llama3.2" selected>llama3.2</option>';

    const { saveProviderSettings } = await import('../settings');
    await saveProviderSettings();

    expect(storage.setOllamaConfig).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
    );
  });

  it('saves brave api key to search config', async () => {
    (document.getElementById('provider-select') as HTMLSelectElement).value = 'ollama';
    (document.getElementById('brave-apikey') as HTMLInputElement).value = 'brave-xyz';
    (document.getElementById('model') as HTMLSelectElement).innerHTML =
      '<option value="llama3.2" selected>llama3.2</option>';

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
    buildDOM();
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

    expect((document.getElementById('settings-status') as HTMLElement).textContent).toContain(
      'Connection refused',
    );
  });
});
