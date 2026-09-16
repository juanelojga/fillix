import packaged from '../prompts/system.md?raw';
import { getChatConfig, setChatConfig } from './storage';

/**
 * The prompt shipped inside the extension. Inlined at build time by Vite's `?raw`,
 * so there is no fetch, no emitted asset and no `web_accessible_resources` entry.
 */
export const DEFAULT_SYSTEM_PROMPT = packaged.trim();

/**
 * An empty stored value means "no override" — the packaged file is the source of
 * truth. That keeps the default in one place instead of copying it into every
 * user's storage the first time Settings is opened.
 */
export async function getSystemPrompt(): Promise<string> {
  const { systemPrompt } = await getChatConfig();
  return systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
}

export async function setSystemPromptOverride(prompt: string): Promise<void> {
  await setChatConfig({ systemPrompt: prompt.trim() });
}

/** Clears the override so `getSystemPrompt` falls back to the packaged file. */
export async function resetSystemPrompt(): Promise<void> {
  await setChatConfig({ systemPrompt: '' });
}
