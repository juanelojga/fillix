import packaged from '../../prompts/linkedin-voice.md?raw';
import { getLinkedInConfig, setLinkedInConfig } from '../storage';

/**
 * The voice spec shipped inside the extension. Inlined at build time by Vite's `?raw`, so
 * there is no fetch, no emitted asset and no `web_accessible_resources` entry — the same
 * mechanism as `system-prompt.ts`, for the same reasons.
 */
export const DEFAULT_VOICE_SPEC = packaged.trim();

/**
 * An empty stored value means "no override", and storage deliberately never holds a copy of
 * the packaged text. Copying it in the first time the editor is opened would mean a later
 * edit to `linkedin-voice.md` silently stopped reaching anyone who had ever looked at it.
 */
export async function getVoiceSpec(): Promise<string> {
  const { voiceSpec } = await getLinkedInConfig();
  return voiceSpec.trim() || DEFAULT_VOICE_SPEC;
}

export async function setVoiceSpecOverride(spec: string): Promise<void> {
  await setLinkedInConfig({ voiceSpec: spec.trim() });
}

/** Clears the override so `getVoiceSpec` falls back to the packaged file. */
export async function resetVoiceSpec(): Promise<void> {
  await setLinkedInConfig({ voiceSpec: '' });
}
