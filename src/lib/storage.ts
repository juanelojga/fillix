import type { ObsidianConfig, OllamaConfig } from '../types';

export type ChatConfig = { systemPrompt: string };

const CHAT_DEFAULTS: ChatConfig = {
  systemPrompt:
    'You are a helpful assistant running locally via Ollama. Keep answers concise unless asked for detail.',
};

const DEFAULT_OLLAMA: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

export async function getOllamaConfig(): Promise<OllamaConfig> {
  const { ollama } = await chrome.storage.local.get('ollama');
  return { ...DEFAULT_OLLAMA, ...((ollama as Partial<OllamaConfig>) ?? {}) };
}

export async function setOllamaConfig(ollama: OllamaConfig): Promise<void> {
  await chrome.storage.local.set({ ollama });
}

export async function getChatConfig(): Promise<ChatConfig> {
  const { chat } = await chrome.storage.local.get('chat');
  return { ...CHAT_DEFAULTS, ...((chat as Partial<ChatConfig>) ?? {}) };
}

export async function setChatConfig(chat: ChatConfig): Promise<void> {
  await chrome.storage.local.set({ chat });
}

const DEFAULT_OBSIDIAN: ObsidianConfig = {
  host: 'localhost',
  port: 27123,
  apiKey: '',
};

export async function getObsidianConfig(): Promise<ObsidianConfig> {
  const { obsidian } = await chrome.storage.local.get('obsidian');
  return { ...DEFAULT_OBSIDIAN, ...((obsidian as Partial<ObsidianConfig>) ?? {}) };
}

export async function setObsidianConfig(config: ObsidianConfig): Promise<void> {
  await chrome.storage.local.set({ obsidian: config });
}
