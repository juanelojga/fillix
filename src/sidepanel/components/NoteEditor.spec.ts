import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import NoteEditor from './NoteEditor.svelte';
import { noteState, resetLoveNote } from '../stores/love-note';

const VARIANTS = ['Hola, Chiqui.', 'Hoy pensé en ti.', 'Te extraño.'];

beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  resetLoveNote();
  noteState.set({ status: 'ready', variants: VARIANTS, chosen: 0, edited: VARIANTS[0] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NoteEditor', () => {
  it('shows the edited text, not the variant the model produced', () => {
    render(NoteEditor, { props: { edited: 'Hola, Chiqui, ¿cómo estás?' } });
    expect((screen.getByLabelText(/The picked message/) as HTMLTextAreaElement).value).toBe(
      'Hola, Chiqui, ¿cómo estás?',
    );
  });

  it('writes keystrokes through to the store', async () => {
    render(NoteEditor, { props: { edited: VARIANTS[0] } });
    await fireEvent.input(screen.getByLabelText(/The picked message/), {
      target: { value: 'Hola, Chiqui, ¿cómo estás?' },
    });
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.edited).toBe('Hola, Chiqui, ¿cómo estás?');
  });

  it('copies what is in the box under its own label', async () => {
    render(NoteEditor, { props: { edited: 'Te extraño.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Te extraño.');
  });

  it('offers Regenerate beside Copy', () => {
    render(NoteEditor, { props: { edited: VARIANTS[0] } });
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
  });
});
