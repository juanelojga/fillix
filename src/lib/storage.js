const DEFAULT_OLLAMA = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};
export async function getProfile() {
  const { profile } = await chrome.storage.local.get('profile');
  return profile ?? {};
}
export async function setProfile(profile) {
  await chrome.storage.local.set({ profile });
}
export async function getOllamaConfig() {
  const { ollama } = await chrome.storage.local.get('ollama');
  return { ...DEFAULT_OLLAMA, ...(ollama ?? {}) };
}
export async function setOllamaConfig(ollama) {
  await chrome.storage.local.set({ ollama });
}
