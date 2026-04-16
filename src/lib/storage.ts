import type { OllamaConfig, UserProfile } from '../types';

const DEFAULT_OLLAMA: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

export async function getProfile(): Promise<UserProfile> {
  const { profile } = await chrome.storage.local.get('profile');
  return (profile as UserProfile) ?? {};
}

export async function setProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ profile });
}

export async function getOllamaConfig(): Promise<OllamaConfig> {
  const { ollama } = await chrome.storage.local.get('ollama');
  return { ...DEFAULT_OLLAMA, ...((ollama as Partial<OllamaConfig>) ?? {}) };
}

export async function setOllamaConfig(ollama: OllamaConfig): Promise<void> {
  await chrome.storage.local.set({ ollama });
}
