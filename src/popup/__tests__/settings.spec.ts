// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// popup/main.ts has module-level DOM side effects — build the required elements
// before the static import triggers them.
vi.hoisted(() => {
  document.body.innerHTML = `
    <button id="save"></button>
    <button id="refresh"></button>
    <input id="baseUrl" />
    <select id="model"></select>
    <input id="obsidian-host" />
    <input id="obsidian-port" type="number" />
    <input id="obsidian-api-key" />
    <input id="obsidian-system-prompt-path" />
    <button id="obsidian-test"></button>
    <div id="obsidian-status"></div>
    <div id="status"></div>
    <button id="obsidian-browse-system-prompt"></button>
  `;
});

import { load, save } from '../main';

const mockGetWorkflowsFolder = vi.hoisted(() => vi.fn().mockResolvedValue('fillix-workflows'));
const mockSetWorkflowsFolder = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetOllamaConfig = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
);
const mockGetObsidianConfig = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ host: 'localhost', port: 27123, apiKey: '' }),
);
const mockSetOllamaConfig = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSetObsidianConfig = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../lib/storage', () => ({
  getWorkflowsFolder: mockGetWorkflowsFolder,
  setWorkflowsFolder: mockSetWorkflowsFolder,
  getOllamaConfig: mockGetOllamaConfig,
  getObsidianConfig: mockGetObsidianConfig,
  setOllamaConfig: mockSetOllamaConfig,
  setObsidianConfig: mockSetObsidianConfig,
}));

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ ok: true, models: [] }),
  },
});

function buildDOM(): void {
  document.body.innerHTML = `
    <input id="baseUrl" />
    <select id="model"></select>
    <button id="refresh"></button>
    <input id="obsidian-host" />
    <input id="obsidian-port" type="number" />
    <input id="obsidian-api-key" type="password" />
    <input id="obsidian-system-prompt-path" />
    <button id="obsidian-test"></button>
    <button id="obsidian-browse-system-prompt" disabled></button>
    <datalist id="vault-files"></datalist>
    <button id="save"></button>
    <div id="status"></div>
    <input id="workflows-folder" type="text" />
  `;
}

describe('popup load() — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildDOM();
    mockGetOllamaConfig.mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    mockGetObsidianConfig.mockResolvedValue({ host: 'localhost', port: 27123, apiKey: '' });
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      models: [],
    });
  });

  it('populates #workflows-folder input from getWorkflowsFolder()', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('my-workflows');
    await load();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'my-workflows',
    );
  });

  it('shows "fillix-workflows" when storage returns the default', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('fillix-workflows');
    await load();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'fillix-workflows',
    );
  });
});

describe('popup save() — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildDOM();
    mockSetOllamaConfig.mockResolvedValue(undefined);
    mockSetObsidianConfig.mockResolvedValue(undefined);
    mockSetWorkflowsFolder.mockResolvedValue(undefined);
  });

  it('calls setWorkflowsFolder with the trimmed input value', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '  jobs  ';
    await save();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('jobs');
  });

  it('uses "fillix-workflows" default when the field is blank', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '';
    await save();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('fillix-workflows');
  });

  it('persists workflowsFolder alongside other settings on save', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = 'sprint-wf';
    await save();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledOnce();
    expect(mockSetOllamaConfig).toHaveBeenCalledOnce();
    expect(mockSetObsidianConfig).toHaveBeenCalledOnce();
  });
});
