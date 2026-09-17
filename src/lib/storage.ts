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
 * The News tab's summary model. '' means "follow the active Ollama model" — the same
 * ''-is-fallback convention as ChatConfig.systemPrompt.
 *
 * Deliberately its own key rather than a field inside `news`: that key is the article
 * cache, and setNewsCache replaces it wholesale on every refresh and every completed
 * summary, which would erase this preference within seconds.
 */
export type NewsConfig = { model: string };

export async function getNewsConfig(): Promise<NewsConfig> {
  const { newsConfig } = await chrome.storage.local.get('newsConfig');
  return { model: (newsConfig as Partial<NewsConfig> | undefined)?.model ?? '' };
}

export async function setNewsConfig(newsConfig: NewsConfig): Promise<void> {
  await chrome.storage.local.set({ newsConfig });
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

/**
 * Which playbook the Workflows tab runs. '' means "never chosen" and resolves to the
 * registry's default — the same ''-is-fallback convention as ChatConfig.systemPrompt.
 *
 * The key is `workflowsConfig`, and the `Config` suffix is not decoration: the bare
 * `workflows` key is one of the Obsidian-era names that `legacy-migration.ts` purges on
 * every install and startup, so a preference stored there would vanish on the next
 * browser restart with nothing logged anywhere.
 */
export type WorkflowsConfig = { playbook: string };

export async function getWorkflowsConfig(): Promise<WorkflowsConfig> {
  const { workflowsConfig } = await chrome.storage.local.get('workflowsConfig');
  return {
    playbook: (workflowsConfig as Partial<WorkflowsConfig> | undefined)?.playbook ?? '',
  };
}

export async function setWorkflowsConfig(workflowsConfig: WorkflowsConfig): Promise<void> {
  await chrome.storage.local.set({ workflowsConfig });
}
