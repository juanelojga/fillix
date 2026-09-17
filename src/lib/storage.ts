import type { NewsItem, NewsSummary, OllamaConfig } from '../types';
import { normalizeAvailability, type WeeklyAvailability } from './profile/availability';

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

/**
 * The user's own CV, project history and availability as one sectioned Markdown document —
 * the evidence every drafted application answer is grounded in.
 *
 * Its own key rather than a field beside `chat`: that key holds a *preference* the user may
 * leave empty forever, while this is content, and the vector index derived from it is
 * rewritten on a completely different schedule. Keeping the prose and the vectors in separate
 * keys means editing a sentence never rewrites a quarter-megabyte of floats, and a failed
 * re-index leaves the prose untouched.
 *
 * `updatedAt: 0` means never saved, which the UI words differently from saved-then-emptied.
 */
export type ProfileDocument = { markdown: string; updatedAt: number };

export async function getProfile(): Promise<ProfileDocument> {
  const { profile } = await chrome.storage.local.get('profile');
  const stored = profile as Partial<ProfileDocument> | undefined;
  return {
    markdown: typeof stored?.markdown === 'string' ? stored.markdown : '',
    updatedAt: typeof stored?.updatedAt === 'number' ? stored.updatedAt : 0,
  };
}

export async function setProfile(profile: ProfileDocument): Promise<void> {
  await chrome.storage.local.set({ profile });
}

/**
 * The embedding model, named by hand exactly as chat models are — the extension never asks
 * Ollama what is installed. '' means "not chosen", and nothing can be indexed until it is.
 *
 * Its own key rather than a second field on `ollama`: that config is the chat model and base
 * URL, read on every message, while this one is read only when indexing or retrieving.
 */
export type ProfileConfig = { embedModel: string };

export async function getProfileConfig(): Promise<ProfileConfig> {
  const { profileConfig } = await chrome.storage.local.get('profileConfig');
  return {
    embedModel: (profileConfig as Partial<ProfileConfig> | undefined)?.embedModel ?? '',
  };
}

export async function setProfileConfig(profileConfig: ProfileConfig): Promise<void> {
  await chrome.storage.local.set({ profileConfig });
}

/** One indexed section: the text an answer may cite, and the vector that finds it. */
export interface IndexedChunk {
  id: string;
  heading: string;
  ordinal: number;
  text: string;
  vector: number[];
}

/**
 * The profile's vectors, and everything needed to know whether they are still valid.
 *
 * `hash` and `chars` are compared against the *current* document, and `model` and `dim`
 * against the current embedding model: vectors from two different models are not comparable
 * to each other at all, so switching models has to invalidate this exactly as an edit does.
 *
 * Separate from the `profile` key because the two are rewritten on different schedules and at
 * wildly different sizes — roughly 275 KB of rounded floats against ~11 KB of prose.
 */
export interface ProfileIndex {
  hash: string;
  chars: number;
  model: string;
  dim: number;
  builtAt: number;
  chunks: IndexedChunk[];
}

export async function getProfileIndex(): Promise<ProfileIndex | null> {
  const { profileIndex } = await chrome.storage.local.get('profileIndex');
  if (!profileIndex || typeof profileIndex !== 'object') return null;
  const index = profileIndex as Partial<ProfileIndex>;
  // Validated rather than trusted, like getNewsCache: a half-written index scores every query
  // identically, which reads as a bad model rather than bad data.
  if (!Array.isArray(index.chunks) || typeof index.hash !== 'string') return null;
  if (typeof index.model !== 'string' || typeof index.dim !== 'number') return null;
  return {
    hash: index.hash,
    chars: index.chars ?? 0,
    model: index.model,
    dim: index.dim,
    builtAt: index.builtAt ?? 0,
    chunks: index.chunks,
  };
}

export async function setProfileIndex(profileIndex: ProfileIndex): Promise<void> {
  await chrome.storage.local.set({ profileIndex });
}

/**
 * The applicant's meeting hours, Monday to Friday.
 *
 * A fourth profile-side key rather than a field on `profile` or `profileConfig`. The prose is
 * content the user writes in long sittings and then indexes; this is rewritten on every
 * checkbox click and is never embedded at all, so folding it into either would either make an
 * hour change invalidate the vectors or make a saved document rewrite the hours.
 *
 * Validation lives in `normalizeAvailability` rather than inline here: a five-day record of
 * two windows each is past the point where field-by-field checks read as a storage concern.
 */
export async function getAvailability(): Promise<WeeklyAvailability> {
  const { availability } = await chrome.storage.local.get('availability');
  return normalizeAvailability(availability);
}

export async function setAvailability(availability: WeeklyAvailability): Promise<void> {
  await chrome.storage.local.set({ availability });
}
