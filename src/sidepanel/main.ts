import { createChatController } from './chat';
import { renderMarkdown } from './markdown';
import {
  getChatConfig,
  getObsidianConfig,
  getOllamaConfig,
  setChatConfig,
  setObsidianConfig,
  setOllamaConfig,
} from '../lib/storage';
import type { Message, MessageResponse, ObsidianConfig } from '../types';

// ── Exported helpers (also called by initSidePanel) ─────────────────────────

let obsidianConnected = false;

export function updateConnectionUI(connected: boolean): void {
  obsidianConnected = connected;
  const localSection = document.getElementById('system-prompt-local-section') as HTMLElement | null;
  const pathsSection = document.getElementById('obsidian-paths-section') as HTMLElement | null;
  const pathsAlert = document.getElementById('obsidian-paths-alert') as HTMLElement | null;
  if (localSection) localSection.hidden = connected;
  if (pathsSection) pathsSection.hidden = !connected;
  if (connected && pathsAlert) {
    const systemPromptPath = (
      document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement | null
    )?.value.trim();
    pathsAlert.hidden = Boolean(systemPromptPath);
  } else if (pathsAlert) {
    pathsAlert.hidden = true;
  }
}

export function syncSidepanelBrowseState(): void {
  const hasKey = Boolean(
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null)?.value.trim(),
  );
  const browseSystem = document.getElementById(
    'sp-obsidian-browse-system-prompt',
  ) as HTMLButtonElement | null;
  const testBtn = document.getElementById('sp-obsidian-test') as HTMLButtonElement | null;
  if (browseSystem) browseSystem.disabled = !hasKey;
  if (testBtn) testBtn.disabled = !hasKey;
}

export async function loadSidepanelObsidian(): Promise<void> {
  const cfg = await getObsidianConfig();
  const host = document.getElementById('sp-obsidian-host') as HTMLInputElement | null;
  const port = document.getElementById('sp-obsidian-port') as HTMLInputElement | null;
  const apiKey = document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null;
  const systemPromptPath = document.getElementById(
    'sp-obsidian-system-prompt-path',
  ) as HTMLInputElement | null;
  if (host) host.value = cfg.host;
  if (port) port.value = String(cfg.port);
  if (apiKey) apiKey.value = cfg.apiKey;
  if (systemPromptPath) systemPromptPath.value = cfg.systemPromptPath ?? '';
  syncSidepanelBrowseState();
}

export async function saveSidepanelObsidian(): Promise<void> {
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
  const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    if (statusEl) statusEl.textContent = '';
    void (async () => {
      try {
        await saveSidepanelObsidian();
        const response = (await chrome.runtime.sendMessage({
          type: 'OBSIDIAN_TEST_CONNECTION',
        } satisfies Message)) as MessageResponse;
        if (response.ok) {
          if (statusEl) {
            statusEl.textContent = 'Connected';
            statusEl.classList.remove('error');
          }
          if (warningEl) warningEl.hidden = true;
          updateConnectionUI(true);
        } else {
          const errMsg = (response as { ok: false; error: string }).error;
          console.error('[Fillix] Obsidian test connection failed:', errMsg);
          if (statusEl) {
            statusEl.textContent = errMsg;
            statusEl.classList.add('error');
          }
          if (warningEl) warningEl.hidden = false;
          updateConnectionUI(false);
        }
      } catch (err) {
        console.error('[Fillix] Obsidian test connection error:', err);
        if (statusEl) {
          statusEl.textContent = String(err);
          statusEl.classList.add('error');
        }
        if (warningEl) warningEl.hidden = false;
        updateConnectionUI(false);
      } finally {
        syncSidepanelBrowseState();
      }
    })();
  });
}

export function wireSidepanelBrowseButtons(): void {
  let activeDropdown: HTMLElement | null = null;
  let dismissHandlers: (() => void) | null = null;

  function closeDropdown(): void {
    activeDropdown?.remove();
    activeDropdown = null;
    if (dismissHandlers) {
      dismissHandlers();
      dismissHandlers = null;
    }
  }

  function openDropdown(files: string[], anchorInput: HTMLInputElement): void {
    closeDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'fillix-browse-dropdown';

    const rect = anchorInput.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'fillix-browse-item';
      item.textContent = file;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        anchorInput.value = file;
        anchorInput.dispatchEvent(new Event('input', { bubbles: true }));
        closeDropdown();
      });
      dropdown.appendChild(item);
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    const onOutsideClick = (e: MouseEvent): void => {
      if (!dropdown.contains(e.target as Node)) closeDropdown();
    };
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeDropdown();
    };

    setTimeout(() => {
      document.addEventListener('mousedown', onOutsideClick);
      document.addEventListener('keydown', onEscape);
    }, 0);

    dismissHandlers = () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEscape);
    };
  }

  function wireBrowseButton(btnId: string, inputId: string): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
      btn.disabled = true;
      void (async () => {
        try {
          const response = (await chrome.runtime.sendMessage({
            type: 'OBSIDIAN_LIST_FILES',
          } satisfies Message)) as MessageResponse;
          if (!response.ok || !('files' in response) || !Array.isArray(response.files)) {
            if (warningEl) warningEl.hidden = false;
            return;
          }
          if (warningEl) warningEl.hidden = true;

          // Keep datalist in sync for typing-based autocomplete
          const dl = document.getElementById('sidepanel-vault-files') as HTMLDataListElement | null;
          if (dl) {
            dl.innerHTML = '';
            response.files.forEach((f) => {
              const opt = document.createElement('option');
              opt.value = f;
              dl.appendChild(opt);
            });
          }

          openDropdown(response.files, input);
        } catch {
          if (warningEl) warningEl.hidden = false;
        } finally {
          syncSidepanelBrowseState();
        }
      })();
    });
  }

  wireBrowseButton('sp-obsidian-browse-system-prompt', 'sp-obsidian-system-prompt-path');
}

export async function buildSystemPrompt(cfg: ObsidianConfig, fallback: string): Promise<string> {
  const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
  const sourceEl = document.getElementById('sp-source') as HTMLElement | null;

  if (!cfg.apiKey || !cfg.systemPromptPath) {
    if (warningEl) warningEl.hidden = true;
    if (sourceEl) sourceEl.hidden = true;
    return fallback;
  }

  let systemPrompt = fallback;
  let fetchFailed = false;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'OBSIDIAN_GET_FILE',
      path: cfg.systemPromptPath,
    } satisfies Message)) as MessageResponse;
    if (response.ok && 'content' in response) {
      systemPrompt = response.content;
    } else {
      fetchFailed = true;
    }
  } catch {
    fetchFailed = true;
  }

  if (warningEl) warningEl.hidden = !fetchFailed;
  if (sourceEl) {
    if (systemPrompt !== fallback) {
      sourceEl.textContent = `System prompt: ${cfg.systemPromptPath}`;
      sourceEl.hidden = false;
    } else {
      sourceEl.hidden = true;
    }
  }

  return systemPrompt;
}

// ── Main init ────────────────────────────────────────────────────────────────

export async function initSidePanel(): Promise<void> {
  const [ollamaConfig, chatConfig] = await Promise.all([getOllamaConfig(), getChatConfig()]);

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
        const text = currentAssistantBubble.textContent ?? '';
        if (text) {
          currentAssistantBubble.innerHTML = renderMarkdown(text);
        } else {
          currentAssistantBubble.remove();
        }
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
    newConvBtn.hidden = false;
  });

  settingsTab.addEventListener('click', () => {
    chatView.hidden = true;
    settingsView.hidden = false;
    settingsTab.classList.add('active');
    chatTab.classList.remove('active');
    newConvBtn.hidden = true;
  });

  // ── New conversation ────────────────────────────────────────────
  newConvBtn.addEventListener('click', () => {
    controller.stop();
    setStreamingUI(false);
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

    const [latestOllama, latestChat, latestObsidian] = await Promise.all([
      getOllamaConfig(),
      getChatConfig(),
      getObsidianConfig(),
    ]);
    currentBaseUrl = latestOllama.baseUrl;

    const systemPrompt = await buildSystemPrompt(latestObsidian, latestChat.systemPrompt);

    appendBubble('user', text);
    currentAssistantBubble = appendBubble('assistant', '');
    setStreamingUI(true);
    controller.send(text, systemPrompt, modelSelect.value);
  }

  // ── Stop ────────────────────────────────────────────────────────
  stopBtn.addEventListener('click', () => controller.stop());

  // ── Settings population ─────────────────────────────────────────
  baseUrlInput.value = ollamaConfig.baseUrl;
  systemPromptInput.value = chatConfig.systemPrompt;
  updateLocalhostWarning(ollamaConfig.baseUrl);
  await loadSidepanelObsidian();

  // Auto-test connection on open if an API key is stored
  const storedObsidian = await getObsidianConfig();
  if (storedObsidian.apiKey) {
    try {
      const autoTestResponse = (await chrome.runtime.sendMessage({
        type: 'OBSIDIAN_TEST_CONNECTION',
      } satisfies Message)) as MessageResponse;
      updateConnectionUI(autoTestResponse.ok);
    } catch {
      updateConnectionUI(false);
    }
  } else {
    updateConnectionUI(false);
  }

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
    await Promise.all([
      setOllamaConfig({ baseUrl: baseUrlInput.value, model: modelSelect.value }),
      setChatConfig({ systemPrompt: systemPromptInput.value }),
      saveSidepanelObsidian(),
    ]);
    updateConnectionUI(obsidianConnected);

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
