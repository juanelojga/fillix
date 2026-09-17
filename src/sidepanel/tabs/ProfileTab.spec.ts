import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ProfileTab from './ProfileTab.svelte';
import {
  draft,
  embedModel,
  indexState,
  profile,
  profileIndex,
  editProfile,
} from '../stores/profile';
import { hashProfile } from '../../lib/profile/profile-hash';

describe('ProfileTab', () => {
  beforeEach(() => {
    vi.spyOn(chrome.storage.local, 'set').mockResolvedValue(undefined);
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    profile.set({ markdown: '', updatedAt: 0 });
    draft.set('');
    embedModel.set('');
    profileIndex.set(null);
    indexState.set({ status: 'idle' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says nothing is saved before the first save', () => {
    render(ProfileTab);

    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByText(/never leaves your machine/)).toBeInTheDocument();
  });

  it('shows the saved document in the editor', () => {
    profile.set({ markdown: '## Python\n\nEight years.', updatedAt: 1 });
    draft.set('## Python\n\nEight years.');

    render(ProfileTab);

    const editor = screen.getByRole('textbox', { name: 'Profile document' }) as HTMLTextAreaElement;
    expect(editor.value).toBe('## Python\n\nEight years.');
  });

  // The Save button is the only writer; typing must never reach storage on its own.
  it('does not write to storage while the user types', async () => {
    render(ProfileTab);

    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python' },
    });

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(get(draft)).toBe('## Python');
  });

  it('disables Save until there is something new to save', async () => {
    render(ProfileTab);
    const save = screen.getByRole('button', { name: 'Save profile' });
    expect(save).toBeDisabled();

    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python' },
    });

    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('saves on the button and confirms in words', async () => {
    render(ProfileTab);
    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python' },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '✓ Saved' })).toBeInTheDocument();
  });

  // Chunking splits on `##`, so the count is the user's only feedback that the document is
  // shaped the way retrieval needs before any model has ever run.
  it('counts the sections the retrieval step will split on', async () => {
    render(ProfileTab);

    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python\n\ntext\n\n## React\n\ntext\n\n### Not a section\n\ntext' },
    });

    expect(screen.getByText('2 sections')).toBeInTheDocument();
  });

  it('counts one section in the singular', async () => {
    render(ProfileTab);
    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python\n\ntext' },
    });

    expect(screen.getByText('1 section')).toBeInTheDocument();
  });

  // Quota is a real failure here — this document is the largest thing the extension stores.
  it('words a failed save and keeps the browser error', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    render(ProfileTab);
    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: '## Python' },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText("Couldn't save your profile")).toBeInTheDocument();
    expect(screen.getByText(/storage quota/)).toBeInTheDocument();
    expect(screen.getByText('QUOTA_BYTES quota exceeded')).toBeInTheDocument();
  });

  it('tells the user how the document is used before they write it', () => {
    editProfile('');
    render(ProfileTab);

    expect(screen.getByText(/cited by its heading/)).toBeInTheDocument();
  });
});

const MARKDOWN = '## Python\n\nEight years.';

function freshIndex() {
  return {
    hash: hashProfile(MARKDOWN, 'nomic'),
    chars: MARKDOWN.length,
    model: 'nomic',
    dim: 768,
    builtAt: Date.parse('2026-09-17T14:03:00Z'),
    chunks: [{ id: 'python-0', heading: 'Python', ordinal: 0, text: MARKDOWN, vector: [1, 0] }],
  };
}

describe('ProfileTab search index', () => {
  beforeEach(() => {
    vi.spyOn(chrome.storage.local, 'set').mockResolvedValue(undefined);
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    profile.set({ markdown: '', updatedAt: 0 });
    draft.set('');
    embedModel.set('');
    profileIndex.set(null);
    indexState.set({ status: 'idle' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Ollama models are never auto-discovered here, so the user has to be told which one and
  // that a chat model will not do.
  it('says an embedding model is a different model, and names one', () => {
    render(ProfileTab);

    expect(screen.getByText(/a chat model cannot embed/)).toBeInTheDocument();
    expect(screen.getByText(/ollama pull nomic-embed-text/)).toBeInTheDocument();
  });

  it('cannot build an index before a model is named', () => {
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    render(ProfileTab);

    expect(screen.getByRole('button', { name: 'Build index' })).toBeDisabled();
    expect(screen.getByText(/Name an embedding model above/)).toBeInTheDocument();
  });

  it('cannot build an index of a profile that was never saved', () => {
    embedModel.set('nomic');
    render(ProfileTab);

    expect(screen.getByRole('button', { name: 'Build index' })).toBeDisabled();
  });

  it('describes a fresh index by shape and time, not by an icon', () => {
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('nomic');
    profileIndex.set(freshIndex());

    render(ProfileTab);

    expect(screen.getByText(/1 sections · 768 dimensions · built/)).toBeInTheDocument();
  });

  it('says the profile changed when the saved document moved on', () => {
    profile.set({ markdown: `${MARKDOWN} More.`, updatedAt: 2 });
    draft.set(`${MARKDOWN} More.`);
    embedModel.set('nomic');
    profileIndex.set(freshIndex());

    render(ProfileTab);

    expect(screen.getByText(/Your profile changed since it was indexed/)).toBeInTheDocument();
  });

  // Two models' vectors share no space at all, so this is a different cause from an edit and
  // deserves different words.
  it('says the vectors no longer compare when the model changed', () => {
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('mxbai-embed-large');
    profileIndex.set(freshIndex());

    render(ProfileTab);

    expect(
      screen.getByText(/the model changed, so the vectors no longer compare/),
    ).toBeInTheDocument();
  });

  // Without this the user presses Build index, sees it succeed, and gets an index of the
  // previous draft with nothing on screen saying so.
  it('warns that the index is built from the saved document, not the editor', async () => {
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('nomic');
    profileIndex.set(freshIndex());
    render(ProfileTab);

    await fireEvent.input(screen.getByRole('textbox', { name: 'Profile document' }), {
      target: { value: `${MARKDOWN} typing` },
    });

    expect(screen.getByText(/the index is built from the saved document/)).toBeInTheDocument();
  });

  it('tests the model through the worker and reports the latency', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true, latencyMs: 120 });
    render(ProfileTab);

    await fireEvent.input(screen.getByRole('textbox', { name: 'Embedding model' }), {
      target: { value: 'nomic-embed-text' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText('Embedded in 120 ms.')).toBeInTheDocument();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'TEST_EMBED_MODEL',
      model: 'nomic-embed-text',
    });
  });

  it('turns a failed build into a worded cause and its next step', async () => {
    profile.set({ markdown: MARKDOWN, updatedAt: 1 });
    draft.set(MARKDOWN);
    embedModel.set('llama3.2');
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: 'Ollama /api/embed returned 400: llama3.2 does not support generate embeddings',
    });
    render(ProfileTab);

    await fireEvent.click(screen.getByRole('button', { name: 'Build index' }));

    expect(await screen.findAllByText(/cannot produce embeddings/)).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toMatch(/Indexing failed\..*cannot produce/);
    expect(
      screen.getByText(/A chat model and an embedding model are different/),
    ).toBeInTheDocument();
  });
});
