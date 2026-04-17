import { createChatController } from './chat';
import { renderMarkdown } from './markdown';
import {
  getChatConfig,
  getObsidianConfig,
  getOllamaConfig,
  getProfile,
  setChatConfig,
  setObsidianConfig,
  setOllamaConfig,
  setProfile,
} from '../lib/storage';
import type { Message, MessageResponse, ObsidianConfig } from '../types';

// ── Exported helpers (also called by initSidePanel) ─────────────────────────

export function toggleProfileFields(config: ObsidianConfig): void {
  const el = document.getElementById('profile-fields');
  if (el) el.hidden = Boolean(config.profilePath);
}

export function syncSidepanelBrowseState(): void {
  const hasKey = Boolean(
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null)?.value.trim(),
  );
  const browseProfile = document.getElementById(
    'sp-obsidian-browse-profile',
  ) as HTMLButtonElement | null;
  const browseSystem = document.getElementById(
    'sp-obsidian-browse-system-prompt',
  ) as HTMLButtonElement | null;
  const testBtn = document.getElementById('sp-obsidian-test') as HTMLButtonElement | null;
  if (browseProfile) browseProfile.disabled = !hasKey;
  if (browseSystem) browseSystem.disabled = !hasKey;
  if (testBtn) testBtn.disabled = !hasKey;
}

export async function loadSidepanelObsidian(): Promise<void> {
  const cfg = await getObsidianConfig();
  const host = document.getElementById('sp-obsidian-host') as HTMLInputElement | null;
  const port = document.getElementById('sp-obsidian-port') as HTMLInputElement | null;
  const apiKey = document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null;
  const profilePath = document.getElementById(
    'sp-obsidian-profile-path',
  ) as HTMLInputElement | null;
  const systemPromptPath = document.getElementById(
    'sp-obsidian-system-prompt-path',
  ) as HTMLInputElement | null;
  if (host) host.value = cfg.host;
  if (port) port.value = String(cfg.port);
  if (apiKey) apiKey.value = cfg.apiKey;
  if (profilePath) profilePath.value = cfg.profilePath ?? '';
  if (systemPromptPath) systemPromptPath.value = cfg.systemPromptPath ?? '';
  toggleProfileFields(cfg);
  syncSidepanelBrowseState();
}

export async function saveSidepanelObsidian(): Promise<void> {
  const profilePath =
    (
      document.getElementById('sp-obsidian-profile-path') as HTMLInputElement | null
    )?.value.trim() || undefined;
  const cfg: ObsidianConfig = {
    host:
      (document.getElementById('sp-obsidian-host') as HTMLInputElement | null)?.value.trim() ??
      'localhost',
    port:
      Math.trunc(
        Number((document.getElementById('sp-obsidian-port') as HTMLInputElement | null)?.value),
      ) || 27123,
    apiKey:
      (document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null)?.value.trim() ??
      '',
    profilePath,
    systemPromptPath:
      (
        document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement | null
      )?.value.trim() || undefined,
  };
  await setObsidianConfig(cfg);
}

export function wireSidepanelTestButton(): void {
  const btn = document.getElementById('sp-obsidian-test') as HTMLButtonElement | null;
  const statusEl = document.getElementById('obsidian-status') as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    if (statusEl) statusEl.textContent = '';
    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'OBSIDIAN_TEST_CONNECTION',
        } satisfies Message)) as MessageResponse;
        if (response.ok) {
          if (statusEl) statusEl.textContent = 'Connected';
        } else {
          if (statusEl) statusEl.textContent = (response as { ok: false; error: string }).error;
        }
      } finally {
        syncSidepanelBrowseState();
      }
    })();
  });
}

export function wireSidepanelBrowseButtons(): void {
  async function fetchAndPopulate(): Promise<void> {
    const response = (await chrome.runtime.sendMessage({
      type: 'OBSIDIAN_LIST_FILES',
    } satisfies Message)) as MessageResponse;
    if (!response.ok || !('files' in response) || !Array.isArray(response.files)) return;
    const dl = document.getElementById('sidepanel-vault-files') as HTMLDataListElement | null;
    if (!dl) return;
    dl.innerHTML = '';
    response.files.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      dl.appendChild(opt);
    });
  }

  const browseProfile = document.getElementById('sp-obsidian-browse-profile');
  const browseSystem = document.getElementById('sp-obsidian-browse-system-prompt');
  if (browseProfile) browseProfile.addEventListener('click', () => void fetchAndPopulate());
  if (browseSystem) browseSystem.addEventListener('click', () => void fetchAndPopulate());
}

export async function buildSystemPrompt(cfg: ObsidianConfig, fallback: string): Promise<string> {
  if (!cfg.systemPromptPath || !cfg.apiKey) return fallback;
  const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'OBSIDIAN_GET_FILE',
      path: cfg.systemPromptPath,
    } satisfies Message)) as MessageResponse;
    if (response.ok && 'content' in response) {
      if (warningEl) warningEl.hidden = true;
      return response.content;
    }
    if (warningEl) warningEl.hidden = false;
    return fallback;
  } catch {
    if (warningEl) warningEl.hidden = false;
    return fallback;
  }
}

// ── Main init ────────────────────────────────────────────────────────────────

export async function initSidePanel(): Promise<void> {
  const [ollamaConfig, chatConfig, profile] = await Promise.all([
    getOllamaConfig(),
    getChatConfig(),
    getProfile(),
  ]);

  // ── DOM refs ────────────────────────────────────────────────────
  const chatView = document.getElementById('chat-view') as HTMLElement;
  const settingsView = document.getElementById('settings-view') as HTMLElement;
  const chatTab = document.getElementById('chat-tab') as HTMLButtonElement;
  const settingsTab = document.getElementById('settings-tab') as HTMLButtonElement;
  const newConvBtn = document.getElementById('new-conversation') as HTMLButtonElement;
  const messagesEl = document.getElementById('messages') as HTMLElement;
  const input = document.getElementById('input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop') as HTMLButtonElement;

  // Settings refs
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
  const modelSelect = document.getElementById('model') as HTMLSelectElement;
  const refreshModelsBtn = document.getElementById('refreshModels') as HTMLButtonElement;
  const systemPromptInput = document.getElementById('systemPrompt') as HTMLTextAreaElement;
  const saveSettingsBtn = document.getElementById('saveSettings') as HTMLButtonElement;
  const settingsStatus = document.getElementById('settings-status') as HTMLElement;
  const localhostWarning = document.getElementById('localhost-warning') as HTMLElement;

  // ── State ───────────────────────────────────────────────────────
  let currentAssistantBubble: HTMLElement | null = null;
  let currentBaseUrl = ollamaConfig.baseUrl;

  // ── Chat controller ─────────────────────────────────────────────
  const controller = createChatController({
    onToken(token) {
      if (currentAssistantBubble) {
        currentAssistantBubble.textContent = (currentAssistantBubble.textContent ?? '') + token;
        scrollToBottom();
      }
    },
    onDone() {
      setStreamingUI(false);
      if (currentAssistantBubble) {
        currentAssistantBubble.innerHTML = renderMarkdown(currentAssistantBubble.textContent ?? '');
        currentAssistantBubble = null;
        scrollToBottom();
      }
    },
    onError(err) {
      setStreamingUI(false);
      if (currentAssistantBubble) {
        currentAssistantBubble.classList.add('error');
        currentAssistantBubble.textContent = `Error: ${err}\n(Ollama at ${currentBaseUrl})`;
        currentAssistantBubble = null;
        scrollToBottom();
      }
    },
  });

  // ── Tab switching ───────────────────────────────────────────────
  chatTab.addEventListener('click', () => {
    chatView.hidden = false;
    settingsView.hidden = true;
    chatTab.classList.add('active');
    settingsTab.classList.remove('active');
  });

  settingsTab.addEventListener('click', () => {
    chatView.hidden = true;
    settingsView.hidden = false;
    settingsTab.classList.add('active');
    chatTab.classList.remove('active');
  });

  // ── New conversation ────────────────────────────────────────────
  newConvBtn.addEventListener('click', () => {
    controller.clear();
    messagesEl.innerHTML = '';
    currentAssistantBubble = null;
  });

  // ── Send ────────────────────────────────────────────────────────
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  sendBtn.addEventListener('click', () => doSend());

  async function doSend(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    setStreamingUI(true);

    const [latestOllama, latestChat, latestObsidian] = await Promise.all([
      getOllamaConfig(),
      getChatConfig(),
      getObsidianConfig(),
    ]);
    currentBaseUrl = latestOllama.baseUrl;

    const systemPrompt = await buildSystemPrompt(latestObsidian, latestChat.systemPrompt);

    appendBubble('user', text);
    currentAssistantBubble = appendBubble('assistant', '');
    controller.send(text, systemPrompt, modelSelect.value);
  }

  // ── Stop ────────────────────────────────────────────────────────
  stopBtn.addEventListener('click', () => controller.stop());

  // ── Settings population ─────────────────────────────────────────
  baseUrlInput.value = ollamaConfig.baseUrl;
  systemPromptInput.value = chatConfig.systemPrompt;
  document.querySelectorAll<HTMLInputElement>('[data-profile]').forEach((el) => {
    el.value = profile[el.dataset.profile!] ?? '';
  });
  updateLocalhostWarning(ollamaConfig.baseUrl);
  await loadSidepanelObsidian();
  wireSidepanelTestButton();
  wireSidepanelBrowseButtons();
  document
    .getElementById('sp-obsidian-api-key')
    ?.addEventListener('input', syncSidepanelBrowseState);
  await refreshModels(ollamaConfig.model);

  baseUrlInput.addEventListener('input', () => {
    updateLocalhostWarning(baseUrlInput.value);
  });

  refreshModelsBtn.addEventListener('click', () => refreshModels(modelSelect.value));

  saveSettingsBtn.addEventListener('click', async () => {
    const profilePath = (
      document.getElementById('sp-obsidian-profile-path') as HTMLInputElement | null
    )?.value.trim();

    const updatedProfile: Record<string, string> = {};
    if (!profilePath) {
      document.querySelectorAll<HTMLInputElement>('[data-profile]').forEach((el) => {
        const value = el.value.trim();
        if (value) updatedProfile[el.dataset.profile!] = value;
      });
    }

    await Promise.all([
      setOllamaConfig({ baseUrl: baseUrlInput.value, model: modelSelect.value }),
      setChatConfig({ systemPrompt: systemPromptInput.value }),
      saveSidepanelObsidian(),
      ...(profilePath ? [] : [setProfile(updatedProfile)]),
    ]);

    toggleProfileFields(await getObsidianConfig());
    settingsStatus.textContent = 'Saved';
    setTimeout(() => (settingsStatus.textContent = ''), 2000);
  });

  // ── Helpers ─────────────────────────────────────────────────────

  function appendBubble(role: 'user' | 'assistant', text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `message ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function setStreamingUI(isStreaming: boolean): void {
    sendBtn.disabled = isStreaming;
    stopBtn.hidden = !isStreaming;
  }

  function scrollToBottom(): void {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateLocalhostWarning(url: string): void {
    localhostWarning.hidden = url === 'http://localhost:11434';
  }

  async function refreshModels(selectedModel?: string): Promise<void> {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'OLLAMA_LIST_MODELS' });
      const response = res as MessageResponse;
      if (response.ok && 'models' in response) {
        populateModelSelect(response.models, selectedModel);
      }
    } catch {
      // Silently fail — Ollama may not be running yet.
    }
  }

  function populateModelSelect(models: string[], selected?: string): void {
    modelSelect.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === selected) opt.selected = true;
      modelSelect.appendChild(opt);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidePanel().catch(console.error);
});
