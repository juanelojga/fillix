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

/**
 * The model a fresh profile drafts with, and the one setting here whose wrong value is unsafe
 * rather than merely inconvenient.
 *
 * `llama3.2` stood here until the eval measured it: over 231 drafts it invented a citation in
 * 57 of them, naming sections of the CV that do not exist and, most often, quoting the job
 * posting back as if it were the applicant's own experience. `drew_on` is non-empty in every
 * one of those, so `normalizeAnswerDraft`'s guard passes them and the panel renders a "Drew on"
 * list the user has no way to know is fiction. A 3B model does not hold "cite only from the
 * evidence" across a prompt carrying both a job and a CV.
 *
 * `gemma4:12b` is the smallest model measured that does: 0 invented citations across 116
 * drafts in two runs. See `eval/README.md` for the scorecard. It is a bigger pull, which is the
 * price of the default being one that cannot quietly lie to a recruiter.
 */
const DEFAULT_OLLAMA: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'gemma4:12b',
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
 * The Workflows tab's two preferences: which playbook it runs, and which model runs it.
 * '' means "never chosen" for both — the playbook resolves to the registry's default and
 * the model to the globally active one, the same ''-is-fallback convention as
 * ChatConfig.systemPrompt.
 *
 * The key is `workflowsConfig`, and the `Config` suffix is not decoration: the bare
 * `workflows` key is one of the Obsidian-era names that `legacy-migration.ts` purges on
 * every install and startup, so a preference stored there would vanish on the next
 * browser restart with nothing logged anywhere.
 */
export type WorkflowsConfig = { playbook: string; model: string };

export async function getWorkflowsConfig(): Promise<WorkflowsConfig> {
  const { workflowsConfig } = await chrome.storage.local.get('workflowsConfig');
  const stored = workflowsConfig as Partial<WorkflowsConfig> | undefined;
  return {
    playbook: stored?.playbook ?? '',
    model: stored?.model ?? '',
  };
}

/**
 * A patch, not a replacement, and that is load-bearing.
 *
 * The two fields have two owners — `stores/playbook.ts` writes the playbook,
 * `stores/settings.ts` writes the model — so a whole-object write from either would
 * silently erase the other's field. Merging here is what keeps those two stores from
 * importing each other to read a value neither of them owns, which would be a cycle.
 */
export async function setWorkflowsConfig(patch: Partial<WorkflowsConfig>): Promise<void> {
  const current = await getWorkflowsConfig();
  await chrome.storage.local.set({ workflowsConfig: { ...current, ...patch } });
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

/**
 * The Tavily API key for the `tavily_search` chat tool, typed in by hand exactly as model
 * names are.
 *
 * The only credential in the extension, and its own key for that reason: nothing else stored
 * here is a secret, and folding it into `ollama` would put one into the object the content
 * script's field-inference path reads on every form it touches.
 *
 * `''` means not configured, the same ''-is-absent convention as `profileConfig.embedModel`,
 * and here it is load-bearing twice. The tool refuses with a worded error naming the Settings
 * tab, and `tools/tool-prompt.ts` withholds `tavily_search` from the system prompt entirely, so
 * a keyless install never spends a ReAct iteration on a search it cannot run.
 *
 * Neither half of the name is free to change. The bare `search` key is the Brave-era name
 * `legacy-migration.ts` deletes on every install *and* startup, so a key stored there would
 * vanish on the next browser restart with nothing logged — the `workflows`/`workflowsConfig`
 * hazard again. And `searchConfig` is pinned dead by `settings-tab.spec.ts` so the retired tool
 * cannot quietly return under its old storage name.
 *
 * If web search is ever removed, this key joins `legacy-migration.ts`: no credential outlives
 * the feature that needed it. That rule is why `search` and `obsidian` are purged today.
 */
export type TavilyConfig = { apiKey: string };

export async function getTavilyConfig(): Promise<TavilyConfig> {
  const { tavilyConfig } = await chrome.storage.local.get('tavilyConfig');
  return { apiKey: (tavilyConfig as Partial<TavilyConfig> | undefined)?.apiKey ?? '' };
}

export async function setTavilyConfig(tavilyConfig: TavilyConfig): Promise<void> {
  await chrome.storage.local.set({ tavilyConfig });
}
