import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import NoteVariants from './NoteVariants.svelte';
import { noteSeed, noteState, resetLoveNote } from '../stores/love-note';

const VARIANTS = ['Hola, Chiqui.', 'Hoy pensé en ti.', 'Te extraño.'];

beforeEach(() => {
  resetLoveNote();
});

describe('NoteVariants', () => {
  it('writes the seed straight through to the store', async () => {
    render(NoteVariants, { props: { variants: [], chosen: 0 } });
    await fireEvent.input(screen.getByLabelText(/Seed/), { target: { value: 'her exam' } });
    expect(get(noteSeed)).toBe('her exam');
  });

  /** Never disabled during a run: the seed is read when the button is pressed. */
  it('leaves the seed box editable with no messages yet', () => {
    render(NoteVariants, { props: { variants: [], chosen: 0 } });
    expect((screen.getByLabelText(/Seed/) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('shows no messages heading before anything has run', () => {
    render(NoteVariants, { props: { variants: [], chosen: 0 } });
    expect(screen.queryByText('Messages')).toBeNull();
  });

  it('renders every variant', () => {
    render(NoteVariants, { props: { variants: VARIANTS, chosen: 0 } });
    for (const text of VARIANTS) expect(screen.getByText(text)).toBeTruthy();
  });

  /** A radio group, not checkboxes: one message becomes the editable text. */
  it('marks exactly one variant as chosen', () => {
    render(NoteVariants, { props: { variants: VARIANTS, chosen: 1 } });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
    expect(radios[1].checked).toBe(true);
  });

  it('writes the choice to the store', async () => {
    noteState.set({ status: 'ready', variants: VARIANTS, chosen: 0, edited: VARIANTS[0] });
    render(NoteVariants, { props: { variants: VARIANTS, chosen: 0 } });
    await fireEvent.change(screen.getAllByRole('radio')[2]);
    const state = get(noteState);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.chosen).toBe(2);
    expect(state.edited).toBe(VARIANTS[2]);
  });
});
