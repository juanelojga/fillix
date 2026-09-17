import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { hashProfile } from '../../lib/profile/profile-hash';

const storageGet = vi.fn();
const storageSet = vi.fn();
const sendMessage = vi.fn();
// Stubbed before the import below, which is the point: storage.ts reads chrome at call time,
// but the store module is evaluated on import and must not find chrome missing.
vi.stubGlobal('chrome', {
  storage: { local: { get: storageGet, set: storageSet } },
  runtime: { sendMessage },
});

const {
  draft,
  embedModel,
  indexIsStale,
  indexState,
  isDirty,
  profile,
  profileIndex,
  editProfile,
  hydrateProfile,
  reindexProfile,
  saveEmbedModel,
  saveProfile,
  testEmbedModel,
  retrieveProfileContext,
} = await import('../stores/profile');

const MARKDOWN = '## Python\n\nEight years.';

function storedIndex(overrides: Record<string, unknown> = {}) {
  return {
    // The same hash profile-index.ts computes for MARKDOWN + 'nomic'; recomputed rather than
    // hardcoded so a change to the hash function fails there, not here.
    hash: hashProfile(MARKDOWN, 'nomic'),
    chars: MARKDOWN.length,
    model: 'nomic',
    dim: 2,
    builtAt: 5,
    chunks: [{ id: 'python-0', heading: 'Python', ordinal: 0, text: MARKDOWN, vector: [1, 0] }],
    ...overrides,
  };
}

describe('profile store', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset();
    profile.set({ markdown: '', updatedAt: 0 });
    draft.set('');
    embedModel.set('');
    profileIndex.set(null);
    indexState.set({ status: 'idle' });
  });

  it('hydrates both the saved document and the editor from storage', async () => {
    storageGet.mockResolvedValue({
      profile: { markdown: '## Python\n\nEight years.', updatedAt: 42 },
    });

    await hydrateProfile();

    expect(get(profile)).toEqual({ markdown: '## Python\n\nEight years.', updatedAt: 42 });
    expect(get(draft)).toBe('## Python\n\nEight years.');
    expect(get(isDirty)).toBe(false);
  });

  // updatedAt 0 is "never saved", which the tab words differently from saved-then-emptied.
  it('starts from an empty document when nothing was ever saved', async () => {
    await hydrateProfile();

    expect(get(profile)).toEqual({ markdown: '', updatedAt: 0 });
  });

  it('marks the profile dirty as soon as the editor diverges', () => {
    editProfile('## Python');

    expect(get(isDirty)).toBe(true);
  });

  it('writes the whole document under the profile key and stamps the time', async () => {
    await saveProfile('## Python\n\nEight years.');

    expect(storageSet).toHaveBeenCalledTimes(1);
    const written = storageSet.mock.calls[0][0] as {
      profile: { markdown: string; updatedAt: number };
    };
    expect(written.profile.markdown).toBe('## Python\n\nEight years.');
    expect(written.profile.updatedAt).toBeGreaterThan(0);
  });

  // The store trims, so the editor has to be told — otherwise the trailing newline the save
  // just removed leaves the tab claiming unsaved changes with no way to clear them.
  it('settles the dirty flag after saving a draft with trailing whitespace', async () => {
    editProfile('## Python\n\nEight years.\n\n   ');

    await saveProfile(get(draft));

    expect(get(profile).markdown).toBe('## Python\n\nEight years.');
    expect(get(draft)).toBe('## Python\n\nEight years.');
    expect(get(isDirty)).toBe(false);
  });

  // A half-written CV must survive the component being unmounted by a tab switch, which is
  // the whole reason the draft lives in a store rather than in ProfileTab.
  it('keeps the editor contents independent of the saved document', () => {
    profile.set({ markdown: 'saved', updatedAt: 1 });
    editProfile('half written');

    expect(get(profile).markdown).toBe('saved');
    expect(get(draft)).toBe('half written');
  });

  it('lets the profile be emptied on purpose', async () => {
    profile.set({ markdown: 'old', updatedAt: 1 });

    await saveProfile('');

    expect(get(profile).markdown).toBe('');
    expect(get(profile).updatedAt).toBeGreaterThan(0);
  });
});

describe('embedding model', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset();
    embedModel.set('');
  });

  it('stores the model under its own key, trimmed', async () => {
    await saveEmbedModel('  nomic-embed-text  ');

    expect(storageSet).toHaveBeenCalledWith({ profileConfig: { embedModel: 'nomic-embed-text' } });
    expect(get(embedModel)).toBe('nomic-embed-text');
  });

  it('reports a successful test with its latency', async () => {
    sendMessage.mockResolvedValue({ ok: true, latencyMs: 120 });

    expect(await testEmbedModel('nomic-embed-text')).toEqual({ ok: true, latencyMs: 120 });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'TEST_EMBED_MODEL',
      model: 'nomic-embed-text',
    });
  });

  it('passes the worker error through rather than inventing one', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Ollama /api/embed returned 404' });

    expect(await testEmbedModel('nope')).toEqual({
      ok: false,
      error: 'Ollama /api/embed returned 404',
    });
  });

  // A suspended worker resolves sendMessage with undefined rather than rejecting, which would
  // otherwise read as a successful test with no latency.
  it('words a silent service worker', async () => {
    sendMessage.mockResolvedValue(undefined);

    expect(await testEmbedModel('nomic')).toEqual({
      ok: false,
      error: 'No response from the extension service worker',
    });
  });
});

describe('index staleness', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset();
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('nomic');
    profileIndex.set(storedIndex());
    indexState.set({ status: 'idle' });
  });

  it('is fresh when the index matches the saved document', () => {
    expect(get(indexIsStale)).toBe(false);
  });

  it('is stale once the saved document changes', async () => {
    await saveProfile(`${MARKDOWN} More.`);

    expect(get(indexIsStale)).toBe(true);
  });

  // The index is built from what is saved. Marking it stale on every keystroke would put
  // "Profile changed since last index" on screen while the user is still typing.
  it('is not stale merely because the editor diverged', () => {
    editProfile(`${MARKDOWN} still typing`);

    expect(get(indexIsStale)).toBe(false);
  });

  it('is stale when the embedding model changes', async () => {
    await saveEmbedModel('mxbai-embed-large');

    expect(get(indexIsStale)).toBe(true);
  });

  it('is stale when there is no index at all', () => {
    profileIndex.set(null);

    expect(get(indexIsStale)).toBe(true);
  });
});

describe('reindexProfile', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset();
    profileIndex.set(null);
    indexState.set({ status: 'idle' });
  });

  // The worker writes the vectors and the panel scores them, so storage is the single copy
  // and the reply carries only the counts the status line prints.
  it('re-reads the index from storage rather than trusting the reply', async () => {
    sendMessage.mockResolvedValue({ ok: true, indexed: { chunks: 1, dim: 2, builtAt: 5 } });
    storageGet.mockResolvedValue({ profileIndex: storedIndex() });

    await reindexProfile();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'PROFILE_INDEX' });
    expect(get(profileIndex)?.chunks[0].vector).toEqual([1, 0]);
    expect(get(indexState)).toEqual({ status: 'idle' });
  });

  it('keeps the worker error for the diagnostics to read', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Ollama /api/embed returned 404' });

    await reindexProfile();

    expect(get(indexState)).toEqual({
      status: 'failed',
      error: 'Ollama /api/embed returned 404',
    });
  });

  it('leaves the previous index alone when a rebuild fails', async () => {
    profileIndex.set(storedIndex());
    sendMessage.mockResolvedValue({ ok: false, error: 'nope' });

    await reindexProfile();

    expect(get(profileIndex)?.chunks).toHaveLength(1);
  });

  it('refuses to start a second build while one is running', async () => {
    indexState.set({ status: 'indexing' });

    await reindexProfile();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('retrieveProfileContext', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset();
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('nomic');
    profileIndex.set(storedIndex());
    indexState.set({ status: 'idle' });
  });

  it('embeds only the query, never the index', async () => {
    sendMessage.mockResolvedValue({ ok: true, queryVector: [1, 0] });

    const result = await retrieveProfileContext('Do you know Python?', 5000);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'PROFILE_QUERY',
      query: 'Do you know Python?',
    });
    expect(result).toEqual({
      ok: true,
      chunks: [{ heading: 'Python', text: MARKDOWN, score: 1 }],
    });
  });

  // Each of these would otherwise reach topChunks and come back as an empty list, which is
  // indistinguishable from "your CV says nothing about this" — a very different thing to
  // tell someone applying for a job.
  it('refuses without an embedding model, before calling the worker', async () => {
    embedModel.set('');

    expect(await retrieveProfileContext('q', 5000)).toEqual({
      ok: false,
      reason: 'no-embed-model',
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('refuses on an empty profile, before calling the worker', async () => {
    profile.set({ markdown: '', updatedAt: 1 });

    expect(await retrieveProfileContext('q', 5000)).toEqual({ ok: false, reason: 'empty-profile' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('refuses when there is no index, before calling the worker', async () => {
    profileIndex.set(null);

    expect(await retrieveProfileContext('q', 5000)).toEqual({ ok: false, reason: 'no-index' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Vectors that no longer describe the document rank the wrong sections, and an answer
  // citing a heading the profile no longer contains is worse than no answer.
  it('refuses a stale index rather than ranking against it', async () => {
    await saveProfile(`${MARKDOWN} More.`);

    expect(await retrieveProfileContext('q', 5000)).toEqual({ ok: false, reason: 'stale-index' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the worker error so the Profile tab can explain it', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Ollama /api/embed returned 404' });

    expect(await retrieveProfileContext('q', 5000)).toEqual({
      ok: false,
      reason: 'embed-failed',
      error: 'Ollama /api/embed returned 404',
    });
  });

  it('words a silent service worker rather than returning no matches', async () => {
    sendMessage.mockResolvedValue(undefined);

    expect(await retrieveProfileContext('q', 5000)).toEqual({
      ok: false,
      reason: 'embed-failed',
      error: 'No response from the extension service worker',
    });
  });

  // A question the profile genuinely has nothing for is a success with no chunks, and must
  // stay distinguishable from every refusal above.
  it('succeeds with an empty list when the query vector cannot be scored', async () => {
    sendMessage.mockResolvedValue({ ok: true, queryVector: [1, 0, 0] });

    expect(await retrieveProfileContext('q', 5000)).toEqual({ ok: true, chunks: [] });
  });
});
