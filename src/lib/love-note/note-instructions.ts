import packaged from '../../prompts/love-note.md?raw';
import { getLoveNoteConfig, setLoveNoteConfig } from '../storage';

/**
 * The standing instructions shipped inside the extension — placeholders only, because the
 * repo is public and the real nickname belongs in storage, not in git. Inlined at build time
 * by Vite's `?raw`, the `linkedin/voice-spec.ts` mechanism.
 */
export const DEFAULT_NOTE_INSTRUCTIONS = packaged.trim();

/**
 * An empty stored value means "no override", and storage deliberately never holds a copy of
 * the packaged text — the `voice-spec.ts` rule, for the same reason: a later edit to
 * `love-note.md` must keep reaching anyone who once opened the editor.
 */
export async function getNoteInstructions(): Promise<string> {
  const { instructions } = await getLoveNoteConfig();
  return instructions.trim() || DEFAULT_NOTE_INSTRUCTIONS;
}

export async function setNoteInstructionsOverride(text: string): Promise<void> {
  await setLoveNoteConfig({ instructions: text.trim() });
}

/** Clears the override so `getNoteInstructions` falls back to the packaged file. */
export async function resetNoteInstructions(): Promise<void> {
  await setLoveNoteConfig({ instructions: '' });
}
