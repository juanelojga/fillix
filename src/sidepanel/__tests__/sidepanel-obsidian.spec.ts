// TODO: Install test runner with: pnpm add -D vitest @vitest/ui jsdom @vitest/browser
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ObsidianConfig } from '../../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function buildDOM() {
  document.body.innerHTML = `
    <div id="obsidian-section">
      <input id="sp-obsidian-host" value="localhost" />
      <input id="sp-obsidian-port" type="number" min="1" max="65535" value="27123" />
      <input id="sp-obsidian-api-key" type="password" value="" />
      <button id="sp-obsidian-test" type="button">Test</button>
      <div id="obsidian-status"></div>
      <div id="obsidian-warning" hidden></div>
      <input id="sp-obsidian-system-prompt-path" value="" />
      <button id="sp-obsidian-browse-system-prompt" type="button">Browse</button>
      <datalist id="sidepanel-vault-files"></datalist>
    </div>
    <textarea id="systemPrompt"></textarea>
    <input id="baseUrl" value="http://localhost:11434" />
    <select id="model"></select>
    <button id="saveSettings">Save</button>
    <div id="settings-status"></div>
  `;
}

const mockSendMessage = vi.fn();
vi.stubGlobal('chrome', { runtime: { sendMessage: mockSendMessage } });

vi.mock('../../lib/storage', () => ({
  getOllamaConfig: vi.fn(async () => ({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })),
  setOllamaConfig: vi.fn(async () => undefined),
  getChatConfig: vi.fn(async () => ({ systemPrompt: 'default system prompt' })),
  setChatConfig: vi.fn(async () => undefined),
  getObsidianConfig: vi.fn(
    async (): Promise<ObsidianConfig> => ({
      host: 'localhost',
      port: 27123,
      apiKey: '',
    }),
  ),
  setObsidianConfig: vi.fn(async () => undefined),
}));

import { getObsidianConfig, setObsidianConfig } from '../../lib/storage';

// ─── HTML structure (Task 4.1 acceptance criteria) ───────────────────────────

describe('Obsidian section HTML structure', () => {
  beforeEach(() => buildDOM());

  it('apiKey input is type="password"', () => {
    const el = document.getElementById('sp-obsidian-api-key') as HTMLInputElement;
    expect(el.type).toBe('password');
  });

  it('port input is type="number" with min=1 and max=65535', () => {
    const el = document.getElementById('sp-obsidian-port') as HTMLInputElement;
    expect(el.type).toBe('number');
    expect(el.min).toBe('1');
    expect(el.max).toBe('65535');
  });

  it('datalist #sidepanel-vault-files starts empty', () => {
    const dl = document.getElementById('sidepanel-vault-files') as HTMLDataListElement;
    expect(dl.options.length).toBe(0);
  });

  it('#obsidian-warning is hidden by default', () => {
    const el = document.getElementById('obsidian-warning') as HTMLElement;
    expect(el.hidden).toBe(true);
  });
});

// ─── syncBrowseButtonState ───────────────────────────────────────────────────

describe('syncBrowseButtonState (sidepanel)', () => {
  beforeEach(() => buildDOM());

  it('disables browse + test buttons when apiKey is empty', async () => {
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement).value = '';
    const { syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    expect(
      (document.getElementById('sp-obsidian-browse-system-prompt') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((document.getElementById('sp-obsidian-test') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables browse + test buttons when apiKey is non-empty', async () => {
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement).value = 'secret';
    const { syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    expect(
      (document.getElementById('sp-obsidian-browse-system-prompt') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((document.getElementById('sp-obsidian-test') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ─── loadSidepanelObsidian() ─────────────────────────────────────────────────

describe('loadSidepanelObsidian()', () => {
  beforeEach(() => {
    buildDOM();
    vi.mocked(getObsidianConfig).mockResolvedValue({
      host: 'myhost',
      port: 9999,
      apiKey: 'my-key',
      systemPromptPath: 'Vault/System.md',
    });
  });

  it('populates all Obsidian inputs from stored config', async () => {
    const { loadSidepanelObsidian } = await import('../main');
    await loadSidepanelObsidian();
    expect((document.getElementById('sp-obsidian-host') as HTMLInputElement).value).toBe('myhost');
    expect((document.getElementById('sp-obsidian-port') as HTMLInputElement).value).toBe('9999');
    expect((document.getElementById('sp-obsidian-api-key') as HTMLInputElement).value).toBe(
      'my-key',
    );
    expect(
      (document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement).value,
    ).toBe('Vault/System.md');
  });
});

// ─── saveSidepanelObsidian() ─────────────────────────────────────────────────

describe('saveSidepanelObsidian()', () => {
  beforeEach(() => {
    buildDOM();
    vi.mocked(getObsidianConfig).mockResolvedValue({ host: 'localhost', port: 27123, apiKey: '' });
    vi.mocked(setObsidianConfig).mockResolvedValue(undefined);
  });

  it('calls setObsidianConfig with values from inputs', async () => {
    (document.getElementById('sp-obsidian-host') as HTMLInputElement).value = 'myhost';
    (document.getElementById('sp-obsidian-port') as HTMLInputElement).value = '9000';
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement).value = 'secret';
    (document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement).value =
      'Sys.md';

    const { saveSidepanelObsidian } = await import('../main');
    await saveSidepanelObsidian();

    expect(setObsidianConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'myhost',
        port: 9000,
        apiKey: 'secret',
        systemPromptPath: 'Sys.md',
      }),
    );
  });
});

// ─── Test button (sidepanel) ─────────────────────────────────────────────────

describe('sidepanel test button (OBSIDIAN_TEST_CONNECTION)', () => {
  beforeEach(() => buildDOM());

  it('sends OBSIDIAN_TEST_CONNECTION when clicked', async () => {
    mockSendMessage.mockResolvedValue({ ok: true });
    const { wireSidepanelTestButton } = await import('../main');
    wireSidepanelTestButton();
    document.getElementById('sp-obsidian-test')!.click();
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'OBSIDIAN_TEST_CONNECTION' });
  });

  it('shows connected text in #obsidian-status on success', async () => {
    mockSendMessage.mockResolvedValue({ ok: true });
    const { wireSidepanelTestButton } = await import('../main');
    wireSidepanelTestButton();
    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('obsidian-status')!.textContent).toMatch(/connected/i);
  });

  it('shows error text in #obsidian-status on failure', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'refused' });
    const { wireSidepanelTestButton } = await import('../main');
    wireSidepanelTestButton();
    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('obsidian-status')!.textContent).toMatch(/refused/i);
  });

  it('disables test button during in-flight request, re-enables after', async () => {
    let resolve!: () => void;
    mockSendMessage.mockReturnValue(
      new Promise<{ ok: true }>((r) => (resolve = () => r({ ok: true }))),
    );
    const { wireSidepanelTestButton } = await import('../main');
    wireSidepanelTestButton();
    const btn = document.getElementById('sp-obsidian-test') as HTMLButtonElement;
    btn.click();
    expect(btn.disabled).toBe(true);
    resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(btn.disabled).toBe(false);
  });
});

// ─── Browse buttons (sidepanel) ──────────────────────────────────────────────

describe('sidepanel browse buttons (OBSIDIAN_LIST_FILES)', () => {
  beforeEach(() => {
    buildDOM();
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement).value = 'key';
  });

  it('sends OBSIDIAN_LIST_FILES when system prompt browse clicked', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, files: ['a.md'] });
    const { wireSidepanelBrowseButtons } = await import('../main');
    wireSidepanelBrowseButtons();
    document.getElementById('sp-obsidian-browse-system-prompt')!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'OBSIDIAN_LIST_FILES' });
  });

  it('populates #sidepanel-vault-files datalist with returned paths', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, files: ['Notes/A.md', 'Profile/Me.md'] });
    const { wireSidepanelBrowseButtons } = await import('../main');
    wireSidepanelBrowseButtons();
    document.getElementById('sp-obsidian-browse-system-prompt')!.click();
    await new Promise((r) => setTimeout(r, 20));
    const dl = document.getElementById('sidepanel-vault-files') as HTMLDataListElement;
    const values = Array.from(dl.options).map((o) => o.value);
    expect(values).toContain('Notes/A.md');
    expect(values).toContain('Profile/Me.md');
  });
});

// ─── doSend() — Obsidian system prompt injection ─────────────────────────────

describe('doSend() — Obsidian system prompt', () => {
  beforeEach(() => {
    buildDOM();
    vi.mocked(getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: 'key',
      systemPromptPath: 'Vault/System.md',
    });
  });

  it('fetches OBSIDIAN_GET_FILE when systemPromptPath is configured', async () => {
    mockSendMessage.mockImplementation((msg: { type: string }) => {
      if (msg.type === 'OBSIDIAN_GET_FILE') return Promise.resolve({ ok: true, content: 'sys' });
      if (msg.type === 'OLLAMA_LIST_MODELS') return Promise.resolve({ ok: true, models: [] });
      return Promise.resolve({ ok: true });
    });

    const { buildSystemPrompt } = await import('../main');
    const result = await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/System.md' },
      'fallback',
    );
    expect(result).toBe('sys');
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'OBSIDIAN_GET_FILE',
      path: 'Vault/System.md',
    });
  });

  it('returns fallback system prompt when Obsidian fetch fails', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'connection refused' });
    const { buildSystemPrompt } = await import('../main');
    const result = await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/System.md' },
      'fallback prompt',
    );
    expect(result).toBe('fallback prompt');
  });

  it('shows #obsidian-warning when Obsidian fetch fails', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'connection refused' });
    const { buildSystemPrompt } = await import('../main');
    await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/System.md' },
      'fallback',
    );
    expect(document.getElementById('obsidian-warning')!.hidden).toBe(false);
  });

  it('hides #obsidian-warning when Obsidian fetch succeeds', async () => {
    // Start with warning visible
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true, content: 'sys content' });
    const { buildSystemPrompt } = await import('../main');
    await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/System.md' },
      'fallback',
    );
    expect(document.getElementById('obsidian-warning')!.hidden).toBe(true);
  });

  it('returns fallback when systemPromptPath is not configured', async () => {
    const { buildSystemPrompt } = await import('../main');
    const result = await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key' },
      'fallback prompt',
    );
    expect(result).toBe('fallback prompt');
  });
});
