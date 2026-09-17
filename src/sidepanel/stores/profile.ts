import { derived, get, writable } from 'svelte/store';
import {
  getProfile,
  getProfileConfig,
  getProfileIndex,
  setProfile,
  setProfileConfig,
  type ProfileDocument,
  type ProfileIndex,
} from '../../lib/storage';
import { isIndexStale } from '../../lib/profile/index-staleness';
import { topChunks, type RetrievedChunk } from '../../lib/profile/retrieve';
import type { RetrievalFailure } from '../../lib/profile/retrieval-diagnostics';
import type { Message, MessageResponse } from '../../types';

/** What is actually in storage. Replaced wholesale on every save. */
export const profile = writable<ProfileDocument>({ markdown: '', updatedAt: 0 });

/**
 * The editor's contents, held here rather than in the tab for the same reason
 * `stores/playbook.ts` holds its run state: bits-ui unmounts the inactive TabsContent, so a
 * half-written CV living in the component would vanish the moment the user glanced at Chat.
 */
export const draft = writable<string>('');

/** The hand-named embedding model. '' means none chosen, and nothing can be indexed. */
export const embedModel = writable<string>('');

/** The stored index, or null when there has never been one. The vectors ride along. */
export const profileIndex = writable<ProfileIndex | null>(null);

export type IndexState =
  | { status: 'idle' }
  | { status: 'indexing' }
  | { status: 'failed'; error: string };

export const indexState = writable<IndexState>({ status: 'idle' });

/**
 * Compared on the *trimmed* draft because that is what `saveProfile` stores — otherwise a
 * trailing newline the save silently removed would leave the tab claiming unsaved changes
 * forever, with a Save button that could never clear it.
 */
export const isDirty = derived(
  [draft, profile],
  ([$draft, $profile]) => $draft.trim() !== $profile.markdown,
);

/**
 * Whether the index still describes the saved document. Compared against `profile`, never
 * `draft`: an index cannot be stale against text that has not been saved yet, and saying so
 * would put "Profile changed since last index" on screen for every keystroke.
 */
export const indexIsStale = derived(
  [profileIndex, profile, embedModel],
  ([$index, $profile, $model]) => isIndexStale($index, $profile.markdown, $model),
);

export async function hydrateProfile(): Promise<void> {
  const [stored, config, index] = await Promise.all([
    getProfile(),
    getProfileConfig(),
    getProfileIndex(),
  ]);
  profile.set(stored);
  draft.set(stored.markdown);
  embedModel.set(config.embedModel);
  profileIndex.set(index);
}

export function editProfile(markdown: string): void {
  draft.set(markdown);
}

export async function saveProfile(markdown: string): Promise<void> {
  const next: ProfileDocument = { markdown: markdown.trim(), updatedAt: Date.now() };
  await setProfile(next);
  profile.set(next);
  // Reflect the trim back into the editor, so the two agree and `isDirty` settles.
  draft.set(next.markdown);
}

export async function saveEmbedModel(name: string): Promise<void> {
  const trimmed = name.trim();
  await setProfileConfig({ embedModel: trimmed });
  embedModel.set(trimmed);
}

export type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export async function testEmbedModel(name: string): Promise<TestResult> {
  const msg: Message = { type: 'TEST_EMBED_MODEL', model: name };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
  if (!response) return { ok: false, error: 'No response from the extension service worker' };
  if (!response.ok) return { ok: false, error: response.error };
  if (!('latencyMs' in response)) return { ok: false, error: 'Unexpected response shape' };
  return { ok: true, latencyMs: response.latencyMs };
}

/**
 * Rebuilds the index in the worker, then re-reads it from storage.
 *
 * Re-reading rather than trusting the reply is deliberate: the worker writes the vectors and
 * the panel needs them for scoring, so storage is the single copy and the reply carries only
 * the counts the status line prints.
 */
export async function reindexProfile(): Promise<void> {
  if (get(indexState).status === 'indexing') return;
  indexState.set({ status: 'indexing' });

  const msg: Message = { type: 'PROFILE_INDEX' };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;

  if (!response) {
    indexState.set({ status: 'failed', error: 'No response from the extension service worker' });
    return;
  }
  if (!response.ok) {
    indexState.set({ status: 'failed', error: response.error });
    return;
  }

  profileIndex.set(await getProfileIndex());
  indexState.set({ status: 'idle' });
}

export type RetrievalResult =
  | { ok: true; chunks: RetrievedChunk[] }
  | ({ ok: false } & RetrievalFailure);

/**
 * The profile sections that should answer one question.
 *
 * Refuses *before* embedding anything whenever the index cannot be trusted, so the caller
 * gets a reason it can word rather than an empty list it has to guess at. That ordering is
 * the point: `topChunks` returns nothing for an unusable index too, and a silent empty result
 * is indistinguishable from "your CV says nothing about this", which is a very different
 * thing to tell someone applying for a job.
 *
 * Only the query crosses the port. The vectors are already here.
 */
export async function retrieveProfileContext(
  query: string,
  budgetChars: number,
): Promise<RetrievalResult> {
  if (!get(embedModel).trim()) return { ok: false, reason: 'no-embed-model' };
  if (!get(profile).markdown.trim()) return { ok: false, reason: 'empty-profile' };

  const index = get(profileIndex);
  if (!index) return { ok: false, reason: 'no-index' };
  if (get(indexIsStale)) return { ok: false, reason: 'stale-index' };

  const msg: Message = { type: 'PROFILE_QUERY', query };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;

  if (!response) {
    return {
      ok: false,
      reason: 'embed-failed',
      error: 'No response from the extension service worker',
    };
  }
  if (!response.ok) return { ok: false, reason: 'embed-failed', error: response.error };
  if (!('queryVector' in response)) {
    return { ok: false, reason: 'embed-failed', error: 'Unexpected response shape' };
  }

  return { ok: true, chunks: topChunks(index, response.queryVector, budgetChars) };
}
