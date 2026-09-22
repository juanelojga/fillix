import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
});

const { noteState, noteSeed, pickNote, editNote, resetLoveNote } =
  await import('../stores/love-note');
const { writeNotes } = await import('../stores/love-note-write');
const { selectedPlaybookId } = await import('../stores/playbook');
const { ollamaConfig, workflowModel } = await import('../stores/settings');

const NOTES = ['Chiqui, ¿cómo te fue?', 'Hoy pensé en ti.', 'Te extraño.'];

/** A promise whose resolution the test controls, to open a window mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true, notes: NOTES });
  selectedPlaybookId.set('love-note');
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'gemma4:12b' });
  workflowModel.set('');
  resetLoveNote();
});

afterEach(() => {
  selectedPlaybookId.set('toptal');
});

describe('love note session', () => {
  it('starts idle', () => {
    expect(get(noteState)).toEqual({ status: 'idle' });
  });

  it('runs and lands the messages with the first one picked', async () => {
    await writeNotes();
    expect(get(noteState)).toEqual({
      status: 'ready',
      variants: NOTES,
      chosen: 0,
      edited: NOTES[0],
    });
  });

  it('sends the seed the user typed, and no instructions', async () => {
    noteSeed.set('her exam went well');
    await writeNotes();
    expect(sendMessage.mock.calls[0]?.[0]).toEqual({
      type: 'NOTE_WRITE',
      seed: 'her exam went well',
      model: 'gemma4:12b',
    });
  });

  it('sends no model at all when nothing resolves', async () => {
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: '' });
    await writeNotes();
    expect(sendMessage.mock.calls[0]?.[0].model).toBeUndefined();
  });

  it('sends the workflow model when one is chosen', async () => {
    workflowModel.set('qwen3:8b');
    await writeNotes();
    expect(sendMessage.mock.calls[0]?.[0].model).toBe('qwen3:8b');
  });

  it('drops a reply that arrives after the playbook changed', async () => {
    const pending = deferred<unknown>();
    sendMessage.mockReturnValue(pending.promise);

    const run = writeNotes();
    expect(get(noteState).status).toBe('running');

    selectedPlaybookId.set('linkedin-post');
    pending.resolve({ ok: true, notes: NOTES });
    await run;

    expect(get(noteState)).toEqual({ status: 'idle' });
  });

  it('clears the seed when the playbook changes', () => {
    noteSeed.set('her exam');
    selectedPlaybookId.set('toptal');
    expect(get(noteSeed)).toBe('');
  });

  it('refuses a second press while one is in flight', async () => {
    const pending = deferred<unknown>();
    sendMessage.mockReturnValue(pending.promise);
    const run = writeNotes();
    await writeNotes();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, notes: NOTES });
    await run;
  });

  it('words a worker failure through the diagnostics module, never raw', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Failed to fetch' });
    await writeNotes();
    const state = get(noteState);
    if (state.status !== 'failed') throw new Error('expected failure');
    expect(state.diagnosis.summary).toBe("Can't reach Ollama");
    expect(state.diagnosis.detail).toBe('Failed to fetch');
    expect(state.diagnosis.hint).toContain('Write messages');
  });

  it('handles a worker that answers with nothing at all', async () => {
    sendMessage.mockResolvedValue(undefined);
    await writeNotes();
    expect(get(noteState).status).toBe('failed');
  });

  it('handles a response of the wrong shape rather than trusting the key is there', async () => {
    sendMessage.mockResolvedValue({ ok: true, topics: [] });
    await writeNotes();
    expect(get(noteState).status).toBe('failed');
  });

  it('names the model that actually ran in the failure hint', async () => {
    workflowModel.set('qwen3:8b');
    sendMessage.mockResolvedValue({ ok: false, error: 'Ollama /api/generate returned 404' });
    await writeNotes();
    const state = get(noteState);
    if (state.status !== 'failed') throw new Error('expected failure');
    expect(state.diagnosis.hint).toContain('qwen3:8b');
  });

  it('regenerates from the seed still in its box and re-picks the first', async () => {
    await writeNotes();
    pickNote(2);
    editNote('edited');
    await writeNotes();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.chosen).toBe(0);
    expect(state.edited).toBe(NOTES[0]);
  });
});

describe('picking and editing', () => {
  it('picks a variant and resets the editable text to it', async () => {
    await writeNotes();
    editNote('a change to the first');
    pickNote(2);
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.chosen).toBe(2);
    expect(state.edited).toBe(NOTES[2]);
  });

  it('ignores an index that is not a variant', async () => {
    await writeNotes();
    pickNote(3);
    pickNote(-1);
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.chosen).toBe(0);
  });

  it('follows keystrokes without touching the variants', async () => {
    await writeNotes();
    editNote('Chiqui, ¿cómo te fue hoy?');
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.edited).toBe('Chiqui, ¿cómo te fue hoy?');
    expect(state.variants).toEqual(NOTES);
  });

  it('does nothing before anything is ready', () => {
    pickNote(0);
    editNote('x');
    expect(get(noteState)).toEqual({ status: 'idle' });
  });
});
