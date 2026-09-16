import type { NewsItem, NewsSummary, OllamaConfig } from '../types';

/** Models the user typed in by hand — never inferred from Ollama. */
export async function getModelList(): Promise<string[]> {
  const { models } = await chrome.storage.local.get('models');
  return Array.isArray(models) ? (models as string[]) : [];
}

export async function setModelList(models: string[]): Promise<void> {
  await chrome.storage.local.set({ models });
}

/** `systemPrompt` is the user's override; '' means fall back to the packaged default. */
export type ChatConfig = { systemPrompt: string };

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
  return { systemPrompt: (chat as Partial<ChatConfig> | undefined)?.systemPrompt ?? '' };
}

export async function setChatConfig(chat: ChatConfig): Promise<void> {
  await chrome.storage.local.set({ chat });
}

/**
 * The last refresh plus any summaries already generated for it, so closing the side
 * panel does not throw away a 20-second summary. Replaced wholesale on every refresh,
 * so it stays bounded to the six items currently on screen.
 */
export interface NewsCache {
  items: NewsItem[];
  fetchedAt: number;
  /** Keyed by NewsItem.id. Only completed summaries — a restored pending state
   *  would be a permanently stuck row. */
  summaries: Record<string, NewsSummary>;
}

export async function getNewsCache(): Promise<NewsCache | null> {
  const { news } = await chrome.storage.local.get('news');
  if (!news || typeof news !== 'object') return null;
  const cache = news as Partial<NewsCache>;
  if (!Array.isArray(cache.items) || typeof cache.fetchedAt !== 'number') return null;
  return {
    items: cache.items,
    fetchedAt: cache.fetchedAt,
    summaries: cache.summaries ?? {},
  };
}

export async function setNewsCache(news: NewsCache): Promise<void> {
  await chrome.storage.local.set({ news });
}
