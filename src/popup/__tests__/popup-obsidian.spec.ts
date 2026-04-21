// TODO: Install test runner with: pnpm add -D vitest @vitest/ui jsdom @vitest/browser
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ObsidianConfig } from '../../types';

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function buildDOM() {
  document.body.innerHTML = `
    <input id="obsidian-host" value="localhost" />
    <input id="obsidian-port" type="number" min="1" max="65535" value="27123" />
    <input id="obsidian-api-key" type="password" value="" />
    <button id="obsidian-test" type="button">Test</button>
    <span id="obsidian-status"></span>
    <div id="obsidian-warning" hidden></div>
    <input id="obsidian-system-prompt-path" value="" />
    <button id="obsidian-browse-system-prompt" type="button">Browse System</button>
    <datalist id="vault-files"></datalist>
    <input id="baseUrl" value="http://localhost:11434" />
    <select id="model"></select>
    <button id="save">Save</button>
    <button id="refresh">Refresh</button>
    <span id="status"></span>
  `;
}

const mockSendMessage = vi.fn().mockResolvedValue({ ok: true, models: [] });
vi.stubGlobal('chrome', { runtime: { sendMessage: mockSendMessage } });

vi.mock('../../lib/storage', () => ({
  getOllamaConfig: vi.fn(async () => ({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })),
  setOllamaConfig: vi.fn(async () => undefined),
  getObsidianConfig: vi.fn(
    async (): Promise<ObsidianConfig> => ({ host: 'localhost', port: 27123, apiKey: '' }),
  ),
  setObsidianConfig: vi.fn(async () => undefined),
  getWorkflowsFolder: vi.fn(async () => 'fillix-workflows'),
  setWorkflowsFolder: vi.fn(async () => undefined),
}));

// ─── Task 5.1: syncBrowseButtonState — popup ─────────────────────────────────

describe('syncBrowseButtonState (popup)', () => {
  beforeEach(() => buildDOM());

  it('disables browse-system-prompt when apiKey is empty', async () => {
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = '';
    const { syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    expect(
      (document.getElementById('obsidian-browse-system-prompt') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('disables test button when apiKey is empty', async () => {
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = '';
    const { syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    expect((document.getElementById('obsidian-test') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables browse-system-prompt and test when apiKey is non-empty', async () => {
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'my-secret-key';
    const { syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    expect(
      (document.getElementById('obsidian-browse-system-prompt') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((document.getElementById('obsidian-test') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables buttons when apiKey is whitespace only', async () => {
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = '   ';
    const { syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    expect((document.getElementById('obsidian-test') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── Task 5.1: load() calls syncBrowseButtonState ────────────────────────────

describe('load() syncs button state on init', () => {
  beforeEach(() => {
    buildDOM();
    mockSendMessage.mockResolvedValue({ ok: true, models: [] });
  });

  it('disables browse-system-prompt on load when stored apiKey is empty', async () => {
    const { load } = await import('../main');
    await load();
    expect(
      (document.getElementById('obsidian-browse-system-prompt') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

// ─── Task 5.1: wireTestButton — re-enables after error (try/finally) ─────────

describe('wireTestButton (popup) — button re-enable on error', () => {
  beforeEach(() => buildDOM());

  it('re-enables test button even when sendMessage rejects', async () => {
    mockSendMessage.mockRejectedValue(new Error('network error'));
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'key';
    const { wireTestButton, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireTestButton();
    const btn = document.getElementById('obsidian-test') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));
    // Button should be re-enabled (apiKey is non-empty)
    expect(btn.disabled).toBe(false);
  });

  it('keeps test button disabled when sendMessage rejects and apiKey is empty', async () => {
    mockSendMessage.mockRejectedValue(new Error('network error'));
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = '';
    const { wireTestButton } = await import('../main');
    wireTestButton();
    const btn = document.getElementById('obsidian-test') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(btn.disabled).toBe(true);
  });
});

// ─── Task 5.3: obsidianUnreachable flag — popup test button ──────────────────

describe('obsidianUnreachable flag — popup test button', () => {
  beforeEach(() => buildDOM());

  it('shows #obsidian-warning when test connection fails', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'connection refused' });
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'key';
    const { wireTestButton, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireTestButton();
    document.getElementById('obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);
  });

  it('hides #obsidian-warning when test connection succeeds', async () => {
    // Start with warning visible
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true });
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'key';
    const { wireTestButton, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireTestButton();
    document.getElementById('obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });

  it('warning persists after failed test until a successful test clears it', async () => {
    // First call fails
    mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'refused' });
    // Second call succeeds
    mockSendMessage.mockResolvedValueOnce({ ok: true });

    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'key';
    const { wireTestButton, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireTestButton();

    document.getElementById('obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);

    document.getElementById('obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });
});

// ─── Task 5.3: obsidianUnreachable flag — popup browse buttons ───────────────

describe('obsidianUnreachable flag — popup browse buttons', () => {
  beforeEach(() => {
    buildDOM();
    (document.getElementById('obsidian-api-key') as HTMLInputElement).value = 'key';
  });

  it('shows #obsidian-warning when OBSIDIAN_LIST_FILES returns ok:false', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'refused' });
    const { wireBrowseButtons, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireBrowseButtons();
    document.getElementById('obsidian-browse-system-prompt')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);
  });

  it('hides #obsidian-warning when OBSIDIAN_LIST_FILES succeeds', async () => {
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true, files: ['Notes.md'] });
    const { wireBrowseButtons, syncBrowseButtonState } = await import('../main');
    syncBrowseButtonState();
    wireBrowseButtons();
    document.getElementById('obsidian-browse-system-prompt')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });
});
