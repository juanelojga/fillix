import { initAgentPanel } from './agent';
import { createChatController } from './chat';
import { appendToolIndicator, resolveToolIndicator } from './chat-tools';
import { renderMarkdown } from './markdown';
import {
  loadProviderSettings,
  loadSidepanelSettings,
  refreshModelsFromProvider,
  saveProviderSettings,
  saveSidepanelSettings,
  updateProviderFieldVisibility,
} from './settings';
import {
  buildSystemPrompt,
  getObsidianConnected,
  loadSidepanelObsidian,
  saveSidepanelObsidian,
  syncSidepanelBrowseState,
  updateConnectionUI,
  wireSidepanelBrowseButtons,
  wireSidepanelTestButton,
} from './obsidian-panel';
import { getChatConfig, getObsidianConfig, getOllamaConfig, setChatConfig } from '../lib/storage';
import type { ProviderType } from '../types';

export async function initSidePanel(): Promise<void> {
  const [ollamaConfig, chatConfig] = await Promise.all([getOllamaConfig(), getChatConfig()]);

  // ── DOM refs ────────────────────────────────────────────────────
  const chatView = document.getElementById('chat-view') as HTMLElement;
  const settingsView = document.getElementById('settings-view') as HTMLElement;
  const agentView = document.getElementById('agent-view') as HTMLElement;
  const chatTab = document.getElementById('chat-tab') as HTMLButtonElement;
  const settingsTab = document.getElementById('settings-tab') as HTMLButtonElement;
  const agentTab = document.getElementById('agent-tab') as HTMLButtonElement;
  const newConvBtn = document.getElementById('new-conversation') as HTMLButtonElement;
  const messagesEl = document.getElementById('messages') as HTMLElement;
  const input = document.getElementById('input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop') as HTMLButtonElement;

  // Settings refs
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
  const modelSelect = document.getElementById('model') as HTMLSelectElement;
  const providerSelectEl = document.getElementById('provider-select') as HTMLSelectElement | null;
  const refreshModelsBtn = document.getElementById('refreshModels') as HTMLButtonElement;
  const systemPromptInput = document.getElementById('systemPrompt') as HTMLTextAreaElement;
  const saveSettingsBtn = document.getElementById('saveSettings') as HTMLButtonElement;
  const settingsStatus = document.getElementById('settings-status') as HTMLElement;
  const localhostWarning = document.getElementById('localhost-warning') as HTMLElement;

  // ── State ───────────────────────────────────────────────────────
  let currentAssistantBubble: HTMLElement | null = null;
  let currentThinkingContent: HTMLElement | null = null;
  let currentResponseContent: HTMLElement | null = null;
  let currentToolIndicator: HTMLElement | null = null;
  let currentBaseUrl = ollamaConfig.baseUrl;

  function resetStreamState(): void {
    currentAssistantBubble = null;
    currentThinkingContent = null;
    currentResponseContent = null;
    currentToolIndicator = null;
  }

  // ── Chat controller ─────────────────────────────────────────────
  const controller = createChatController({
    onThinking(token) {
      if (!currentAssistantBubble) return;
      if (!currentThinkingContent) {
        const details = document.createElement('details');
        details.className = 'thinking-block';
        const summary = document.createElement('summary');
        summary.textContent = 'Thinking…';
        const pre = document.createElement('pre');
        details.appendChild(summary);
        details.appendChild(pre);
        currentAssistantBubble.appendChild(details);
        currentThinkingContent = pre;
      }
      currentThinkingContent.textContent = (currentThinkingContent.textContent ?? '') + token;
      scrollToBottom();
    },
    onToken(token) {
      if (!currentAssistantBubble) return;
      if (!currentResponseContent) {
        const div = document.createElement('div');
        div.className = 'response-content';
        currentAssistantBubble.appendChild(div);
        currentResponseContent = div;
      }
      currentResponseContent.textContent = (currentResponseContent.textContent ?? '') + token;
      scrollToBottom();
    },
    onDone() {
      setStreamingUI(false);
      if (currentAssistantBubble) {
        const thinkingDetails = currentAssistantBubble.querySelector('details.thinking-block');
        if (thinkingDetails) {
          (thinkingDetails.querySelector('summary') as HTMLElement).textContent = 'Thinking';
        }
        const responseEl = currentResponseContent;
        if (responseEl) {
          const text = responseEl.textContent ?? '';
          if (text) {
            responseEl.innerHTML = renderMarkdown(text);
          } else {
            responseEl.remove();
          }
        } else if (!thinkingDetails) {
          currentAssistantBubble.remove();
        }
        resetStreamState();
        scrollToBottom();
      }
    },
    onError(err) {
      setStreamingUI(false);
      if (currentAssistantBubble) {
        currentAssistantBubble.classList.add('error');
        currentAssistantBubble.textContent = `Error: ${err}\n(at ${currentBaseUrl})`;
        resetStreamState();
        scrollToBottom();
      }
    },
    onToolCall(toolName, args) {
      currentToolIndicator = appendToolIndicator(toolName, args, messagesEl);
      scrollToBottom();
    },
    onToolResult(_toolName, result) {
      if (currentToolIndicator) {
        resolveToolIndicator(currentToolIndicator, result);
        currentToolIndicator = null;
      }
      scrollToBottom();
    },
  });

  // ── Tab switching ───────────────────────────────────────────────
  chatTab.addEventListener('click', () => {
    chatView.hidden = false;
    settingsView.hidden = true;
    agentView.hidden = true;
    chatTab.classList.add('active');
    settingsTab.classList.remove('active');
    agentTab.classList.remove('active');
    newConvBtn.hidden = false;
  });

  settingsTab.addEventListener('click', () => {
    chatView.hidden = true;
    settingsView.hidden = false;
    agentView.hidden = true;
    settingsTab.classList.add('active');
    chatTab.classList.remove('active');
    agentTab.classList.remove('active');
    newConvBtn.hidden = true;
  });

  agentTab.addEventListener('click', () => {
    chatView.hidden = true;
    settingsView.hidden = true;
    agentView.hidden = false;
    agentTab.classList.add('active');
    chatTab.classList.remove('active');
    settingsTab.classList.remove('active');
    newConvBtn.hidden = true;
  });

  // ── New conversation ────────────────────────────────────────────
  newConvBtn.addEventListener('click', () => {
    controller.stop();
    setStreamingUI(false);
    controller.clear();
    messagesEl.innerHTML = '';
    resetStreamState();
  });

  // ── Send ────────────────────────────────────────────────────────
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  function resizeInput(): void {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }
  input.addEventListener('input', resizeInput);

  sendBtn.addEventListener('click', () => doSend());

  async function doSend(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

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
  systemPromptInput.value = chatConfig.systemPrompt;
  updateLocalhostWarning(ollamaConfig.baseUrl);
  await loadSidepanelObsidian();
  await loadSidepanelSettings();
  await loadProviderSettings();

  // Auto-test connection on open if an API key is stored
  const storedObsidian = await getObsidianConfig();
  if (storedObsidian.apiKey) {
    try {
      const autoTestResponse = (await chrome.runtime.sendMessage({
        type: 'OBSIDIAN_TEST_CONNECTION',
      })) as { ok: boolean };
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
  await refreshModelsFromProvider(ollamaConfig.model);

  providerSelectEl?.addEventListener('change', () => {
    updateProviderFieldVisibility(providerSelectEl.value as ProviderType);
    void refreshModelsFromProvider();
  });

  baseUrlInput.addEventListener('input', () => {
    updateLocalhostWarning(baseUrlInput.value);
  });

  refreshModelsBtn.addEventListener(
    'click',
    () => void refreshModelsFromProvider(modelSelect.value),
  );

  saveSettingsBtn.addEventListener('click', async () => {
    await Promise.all([
      saveProviderSettings(),
      setChatConfig({ systemPrompt: systemPromptInput.value }),
      saveSidepanelObsidian(),
      saveSidepanelSettings(),
    ]);
    updateConnectionUI(getObsidianConnected());
    settingsStatus.textContent = 'Saved';
    setTimeout(() => (settingsStatus.textContent = ''), 2000);
  });

  await initAgentPanel();

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
}

document.addEventListener('DOMContentLoaded', () => {
  initSidePanel().catch(console.error);
});
