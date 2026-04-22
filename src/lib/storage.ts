import type {
  ObsidianConfig,
  OllamaConfig,
  ProviderConfig,
  SearchConfig,
  WorkflowDefinition,
} from '../types';

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

export async function getProfile(): Promise<string> {
  const { profile } = await chrome.storage.local.get('profile');
  return (profile as string | undefined) ?? '';
}

export async function setProfile(profile: string): Promise<void> {
  await chrome.storage.local.set({ profile });
}

export async function getWorkflows(): Promise<WorkflowDefinition[]> {
  const { workflows } = await chrome.storage.local.get('workflows');
  return Array.isArray(workflows) ? (workflows as WorkflowDefinition[]) : [];
}

export async function setWorkflows(workflows: WorkflowDefinition[]): Promise<void> {
  await chrome.storage.local.set({ workflows });
}

export async function getWorkflowsFolder(): Promise<string> {
  const { workflowsFolder } = await chrome.storage.local.get('workflowsFolder');
  return (workflowsFolder as string | undefined) ?? 'fillix-workflows';
}

export async function setWorkflowsFolder(folder: string): Promise<void> {
  await chrome.storage.local.set({ workflowsFolder: folder });
}

const DEFAULT_PROVIDER: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

export async function getProviderConfig(): Promise<ProviderConfig> {
  const { provider, ollama } = await chrome.storage.local.get(['provider', 'ollama']);
  if (provider) return provider as ProviderConfig;
  if (ollama) return { ...DEFAULT_PROVIDER, ...((ollama as Partial<OllamaConfig>) ?? {}) };
  return DEFAULT_PROVIDER;
}

export async function setProviderConfig(config: ProviderConfig): Promise<void> {
  await chrome.storage.local.set({ provider: config });
}

export async function getSearchConfig(): Promise<SearchConfig> {
  const { search } = await chrome.storage.local.get('search');
  return (search as SearchConfig | undefined) ?? {};
}

export async function setSearchConfig(config: SearchConfig): Promise<void> {
  await chrome.storage.local.set({ search: config });
}
