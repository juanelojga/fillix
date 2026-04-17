import { createChatController } from './chat';
import { renderMarkdown } from './markdown';
import { getChatConfig, getOllamaConfig, setChatConfig, setOllamaConfig } from '../lib/storage';
import type { MessageResponse } from '../types';

export async function initSidePanel(): Promise<void> {
  const ollamaConfig = await getOllamaConfig();
  const chatConfig = await getChatConfig();

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

    // Read config at send time so changes take effect immediately.
    const [latestOllama, latestChat] = await Promise.all([getOllamaConfig(), getChatConfig()]);
    currentBaseUrl = latestOllama.baseUrl;

    appendBubble('user', text);
    currentAssistantBubble = appendBubble('assistant', '');
    controller.send(text, latestChat.systemPrompt);
  }

  // ── Stop ────────────────────────────────────────────────────────
  stopBtn.addEventListener('click', () => controller.stop());

  // ── Settings population ─────────────────────────────────────────
  baseUrlInput.value = ollamaConfig.baseUrl;
  systemPromptInput.value = chatConfig.systemPrompt;
  updateLocalhostWarning(ollamaConfig.baseUrl);
  await refreshModels(ollamaConfig.model);

  baseUrlInput.addEventListener('input', () => {
    updateLocalhostWarning(baseUrlInput.value);
  });

  refreshModelsBtn.addEventListener('click', () => refreshModels(modelSelect.value));

  saveSettingsBtn.addEventListener('click', async () => {
    await Promise.all([
      setOllamaConfig({ baseUrl: baseUrlInput.value, model: modelSelect.value }),
      setChatConfig({ systemPrompt: systemPromptInput.value }),
    ]);
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
