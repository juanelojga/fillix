import { writable, derived, get } from 'svelte/store';
import type { MessageResponse, OllamaConfig } from '../../types';
import {
  getOllamaConfig,
  setOllamaConfig,
  getModelList,
  setModelList,
  getChatConfig,
  getNewsConfig,
  setNewsConfig,
  getLinkedInConfig,
  getLoveNoteConfig,
  getWorkflowsConfig,
  setWorkflowsConfig,
} from '../../lib/storage';
import { resolveSummaryModel } from '../../lib/news/summary-model';
import { resolveWorkflowModel } from '../../lib/playbooks/workflow-model';
import {
  setSystemPromptOverride,
  resetSystemPrompt as clearOverride,
} from '../../lib/system-prompt';
import {
  setVoiceSpecOverride,
  resetVoiceSpec as clearVoiceSpec,
} from '../../lib/linkedin/voice-spec';
import {
  setNoteInstructionsOverride,
  resetNoteInstructions as clearNoteInstructions,
} from '../../lib/love-note/note-instructions';

export const ollamaConfig = writable<OllamaConfig | null>(null);
/** The hand-maintained model list — never populated from /api/tags. */
export const modelList = writable<string[]>([]);
/** The user's system-prompt override. '' means the packaged default is in use. */
export const systemPromptOverride = writable<string>('');
/** The News tab's summary model. '' means "same as chat", i.e. the active model. */
export const newsModel = writable<string>('');
/** The Workflows tab's model. '' means "same as chat", i.e. the active model. */
export const workflowModel = writable<string>('');

/**
 * What will actually run for News summaries. The single source of truth for both the
 * picker's trigger label and the model sent on NEWS_SUMMARIZE, so the two cannot drift.
 */
export const effectiveSummaryModel = derived([newsModel, ollamaConfig], ([pref, cfg]) =>
  resolveSummaryModel(pref, cfg?.model ?? ''),
);

/**
 * What will actually run for the Workflows tab's two generations, DRAFT_ANSWER and
 * EXTRACT_QUESTION_TIMES. One source of truth for the picker's trigger, the model that
 * rides on both messages, and the model `diagnoseDraftFailure` names — so a failure
 * hint can never name a model that did not run.
 *
 * Lives here rather than in `stores/playbook.ts` for two reasons. That store would need
 * `ollamaConfig` to derive this while this file needs the preference for `removeModel`,
 * which is a cycle; and a model writer sitting beside `selectPlaybook` would invite the
 * bug of clearing a capture the user is mid-draft on, since changing the model has no
 * bearing on whether a displayed result still belongs to the displayed playbook.
 */
export const effectiveWorkflowModel = derived([workflowModel, ollamaConfig], ([pref, cfg]) =>
  resolveWorkflowModel(pref, cfg?.model ?? ''),
);

export type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export async function loadSettings(): Promise<void> {
  const [ollama, models, chat, news, workflows, linkedin, loveNote] = await Promise.all([
    getOllamaConfig(),
    getModelList(),
    getChatConfig(),
    getNewsConfig(),
    // Read here as well as in `hydratePlaybookSelection`: two parallel reads of one tiny
    // key is cheaper than either store importing the other to fetch a field it does not own.
    getWorkflowsConfig(),
    getLinkedInConfig(),
    getLoveNoteConfig(),
  ]);
  ollamaConfig.set(ollama);
  systemPromptOverride.set(chat.systemPrompt);
  newsModel.set(news.model);
  workflowModel.set(workflows.model);
  voiceSpecOverride.set(linkedin.voiceSpec);
  noteInstructionsOverride.set(loveNote.instructions);
  // An existing install has a model but no list yet — seed it so the picker isn't empty.
  modelList.set(models.length === 0 && ollama.model ? [ollama.model] : models);
}

export async function saveSettings(newOllamaConfig: OllamaConfig): Promise<void> {
  await setOllamaConfig(newOllamaConfig);
  ollamaConfig.set(newOllamaConfig);
}

export async function addModel(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = get(modelList);
  if (current.includes(trimmed)) return;
  const updated = [...current, trimmed];
  await setModelList(updated);
  modelList.set(updated);
  // First model added becomes the active one.
  if (!get(ollamaConfig)?.model) await setActiveModel(trimmed);
}

export async function removeModel(name: string): Promise<void> {
  const updated = get(modelList).filter((m) => m !== name);
  await setModelList(updated);
  modelList.set(updated);
  if (get(ollamaConfig)?.model === name) await setActiveModel(updated[0] ?? '');
  // Back to "same as chat", not updated[0]: the active model must always name something,
  // but the News preference has a real empty state, and silently promoting a model the
  // user never picked for summaries would be worse than falling back visibly.
  if (get(newsModel) === name) await setNewsModel('');
  // Same reasoning for the Workflows tab, and it matters more there: a drafting model
  // the user never picked writes answers a recruiter reads.
  if (get(workflowModel) === name) await setWorkflowModel('');
}

export async function setActiveModel(name: string): Promise<void> {
  const cfg = get(ollamaConfig);
  if (!cfg || cfg.model === name) return;
  const updated = { ...cfg, model: name };
  await setOllamaConfig(updated);
  ollamaConfig.set(updated);
}

/** '' is a meaningful value here: it puts the News tab back on the active model. */
export async function setNewsModel(name: string): Promise<void> {
  if (get(newsModel) === name) return;
  await setNewsConfig({ model: name });
  newsModel.set(name);
}

/**
 * '' puts the Workflows tab back on the active model.
 *
 * Writes a *patch* — `setWorkflowsConfig` merges — because the selected playbook shares
 * this key and is owned by `stores/playbook.ts`.
 */
export async function setWorkflowModel(name: string): Promise<void> {
  if (get(workflowModel) === name) return;
  await setWorkflowsConfig({ model: name });
  workflowModel.set(name);
}

/**
 * Runs a real one-token generation through the background worker. Errors are
 * returned rather than swallowed — the message is the whole point of testing.
 */
export async function testModel(name: string): Promise<TestResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'TEST_MODEL',
      model: name,
    })) as MessageResponse | undefined;
    if (response?.ok && 'latencyMs' in response) return { ok: true, latencyMs: response.latencyMs };
    if (response && !response.ok) return { ok: false, error: response.error };
    return { ok: false, error: 'No response from the extension service worker' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The LinkedIn composer's voice spec override. '' means the packaged
 * `src/prompts/linkedin-voice.md` is in use, and storage never holds a copy of it.
 *
 * Here rather than in a composer store for the reason the editor lives in Settings: this is
 * a preference edited in long sittings, while `stores/composer.ts` holds a session that is
 * cleared whenever the playbook changes.
 */
export const voiceSpecOverride = writable<string>('');

export async function saveVoiceSpec(text: string): Promise<void> {
  await setVoiceSpecOverride(text);
  voiceSpecOverride.set(text.trim());
}

export async function resetVoiceSpec(): Promise<void> {
  await clearVoiceSpec();
  voiceSpecOverride.set('');
}

/**
 * The love note's standing-instructions override. '' means the packaged
 * `src/prompts/love-note.md` is in use. Here for `voiceSpecOverride`'s reason: a preference
 * edited in long sittings, not a session `stores/love-note.ts` clears on every switch.
 */
export const noteInstructionsOverride = writable<string>('');

export async function saveNoteInstructions(text: string): Promise<void> {
  await setNoteInstructionsOverride(text);
  noteInstructionsOverride.set(text.trim());
}

export async function resetNoteInstructions(): Promise<void> {
  await clearNoteInstructions();
  noteInstructionsOverride.set('');
}

/** Persists an override. A blank value is stored as '', i.e. back to the default. */
export async function saveSystemPrompt(text: string): Promise<void> {
  await setSystemPromptOverride(text);
  systemPromptOverride.set(text.trim());
}

export async function resetSystemPrompt(): Promise<void> {
  await clearOverride();
  systemPromptOverride.set('');
}
