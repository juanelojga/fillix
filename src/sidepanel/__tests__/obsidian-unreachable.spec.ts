// TODO: Install test runner with: pnpm add -D vitest @vitest/ui jsdom @vitest/browser
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ObsidianConfig } from '../../types';

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function buildDOM() {
  document.body.innerHTML = `
    <input id="sp-obsidian-host" value="localhost" />
    <input id="sp-obsidian-port" type="number" min="1" max="65535" value="27123" />
    <input id="sp-obsidian-api-key" type="password" value="key" />
    <button id="sp-obsidian-test" type="button">Test</button>
    <div id="obsidian-status"></div>
    <div id="obsidian-warning" hidden></div>
    <input id="sp-obsidian-profile-path" value="" />
    <button id="sp-obsidian-browse-profile" type="button">Browse Profile</button>
    <input id="sp-obsidian-system-prompt-path" value="" />
    <button id="sp-obsidian-browse-system-prompt" type="button">Browse System</button>
    <datalist id="sidepanel-vault-files"></datalist>
    <div id="profile-fields">
      <input data-profile="firstName" value="" />
    </div>
  `;
}

const mockSendMessage = vi.fn();
vi.stubGlobal('chrome', { runtime: { sendMessage: mockSendMessage } });

vi.mock('../../lib/storage', () => ({
  getOllamaConfig: vi.fn(async () => ({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })),
  getProfile: vi.fn(async () => ({})),
  setOllamaConfig: vi.fn(async () => undefined),
  setProfile: vi.fn(async () => undefined),
  getChatConfig: vi.fn(async () => ({ systemPrompt: 'default' })),
  setChatConfig: vi.fn(async () => undefined),
  getObsidianConfig: vi.fn(
    async (): Promise<ObsidianConfig> => ({ host: 'localhost', port: 27123, apiKey: 'key' }),
  ),
  setObsidianConfig: vi.fn(async () => undefined),
}));

// ─── Task 5.3: unreachable flag — sidepanel test button ──────────────────────

describe('obsidianUnreachable flag — sidepanel test button', () => {
  beforeEach(() => buildDOM());

  it('shows #obsidian-warning when OBSIDIAN_TEST_CONNECTION returns ok:false', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'refused' });
    const { wireSidepanelTestButton, syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelTestButton();
    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);
  });

  it('hides #obsidian-warning when OBSIDIAN_TEST_CONNECTION returns ok:true', async () => {
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true });
    const { wireSidepanelTestButton, syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelTestButton();
    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });

  it('warning persists after failed test until a successful test clears it', async () => {
    mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'refused' });
    mockSendMessage.mockResolvedValueOnce({ ok: true });

    const { wireSidepanelTestButton, syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelTestButton();

    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);

    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });
});

// ─── Task 5.3: unreachable flag — sidepanel browse buttons ───────────────────

describe('obsidianUnreachable flag — sidepanel browse buttons', () => {
  beforeEach(() => buildDOM());

  it('shows #obsidian-warning when OBSIDIAN_LIST_FILES returns ok:false', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'refused' });
    const { wireSidepanelBrowseButtons, syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelBrowseButtons();
    document.getElementById('sp-obsidian-browse-profile')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);
  });

  it('hides #obsidian-warning when OBSIDIAN_LIST_FILES returns ok:true', async () => {
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true, files: ['Notes.md'] });
    const { wireSidepanelBrowseButtons, syncSidepanelBrowseState } = await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelBrowseButtons();
    document.getElementById('sp-obsidian-browse-profile')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });

  it('a failed browse failure is cleared by a subsequent successful test connection', async () => {
    // Browse fails first
    mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'refused' });
    // Test connection succeeds
    mockSendMessage.mockResolvedValueOnce({ ok: true });

    const { wireSidepanelBrowseButtons, wireSidepanelTestButton, syncSidepanelBrowseState } =
      await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelBrowseButtons();
    wireSidepanelTestButton();

    document.getElementById('sp-obsidian-browse-profile')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);

    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });
});

// ─── Task 5.3: unreachable flag — buildSystemPrompt interaction ───────────────

describe('obsidianUnreachable flag — buildSystemPrompt clears warning', () => {
  beforeEach(() => buildDOM());

  it('hides #obsidian-warning after successful system prompt fetch clears the flag', async () => {
    (document.getElementById('obsidian-warning') as HTMLElement).hidden = false;
    mockSendMessage.mockResolvedValue({ ok: true, content: 'sys content' });
    const { buildSystemPrompt } = await import('../main');
    await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/Sys.md' },
      'fallback',
    );
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });

  it('a prior test-button failure is cleared by a successful system prompt fetch', async () => {
    // Test button fails
    mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'refused' });
    // System prompt fetch succeeds
    mockSendMessage.mockResolvedValueOnce({ ok: true, content: 'sys content' });

    const { wireSidepanelTestButton, syncSidepanelBrowseState, buildSystemPrompt } =
      await import('../main');
    syncSidepanelBrowseState();
    wireSidepanelTestButton();

    document.getElementById('sp-obsidian-test')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(false);

    await buildSystemPrompt(
      { host: 'localhost', port: 27123, apiKey: 'key', systemPromptPath: 'Vault/Sys.md' },
      'fallback',
    );
    expect((document.getElementById('obsidian-warning') as HTMLElement).hidden).toBe(true);
  });
});
