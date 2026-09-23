import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LoveNotePanel from './LoveNotePanel.svelte';
import { noteSeed, noteState } from '../stores/love-note';
import type { NoteDiagnosis } from '$lib/love-note/note-diagnostics';

const DESCRIPTION = 'Write messages drafts three romantic messages in Spanish.';

const diagnosis: NoteDiagnosis = {
  cause: 'unreachable',
  summary: "Can't reach Ollama",
  hint: 'Check that "ollama serve" is running, then press Write messages.',
  detail: 'Failed to fetch',
  context: 'writing the messages · POST http://localhost:11434/api/generate',
};

beforeEach(() => {
  noteSeed.set('');
  noteState.set({ status: 'idle' });
});

describe('LoveNotePanel', () => {
  it('shows the playbook description as its empty state, with the seed box already there', () => {
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
    expect(screen.getByLabelText(/Seed/)).toBeTruthy();
  });

  it('says what is happening in words, never a bare spinner', () => {
    noteState.set({ status: 'running' });
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(/Writing three messages in Spanish/)).toBeTruthy();
  });

  /** All four of summary, hint, context and detail — the diagnostics convention. */
  it('renders every part of a diagnosis', () => {
    noteState.set({ status: 'failed', diagnosis });
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText("Can't reach Ollama")).toBeTruthy();
    expect(screen.getByText(/ollama serve/)).toBeTruthy();
    expect(screen.getByText(/api\/generate/)).toBeTruthy();
    expect(screen.getByText('Failed to fetch')).toBeTruthy();
  });

  it('keeps the seed box on screen through a failure, so a retry needs no retyping', () => {
    noteSeed.set('her exam');
    noteState.set({ status: 'failed', diagnosis });
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect((screen.getByLabelText(/Seed/) as HTMLTextAreaElement).value).toBe('her exam');
  });

  it('renders the variants and the editor once they are ready', () => {
    noteState.set({
      status: 'ready',
      variants: ['Hola, Chiqui.', 'Oye.', 'Te extraño.'],
      chosen: 0,
      edited: 'Hola, Chiqui.',
    });
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText('Te extraño.')).toBeTruthy();
    expect((screen.getByLabelText(/The picked message/) as HTMLTextAreaElement).value).toBe(
      'Hola, Chiqui.',
    );
  });

  /** Said on screen rather than left to be discovered by hunting for a button that is not there. */
  it('says messages are copied, never sent', () => {
    render(LoveNotePanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(/copied, never sent/)).toBeTruthy();
  });

  it('offers no fill and no send control in any state', () => {
    for (const state of [
      { status: 'idle' } as const,
      { status: 'ready', variants: ['Hola.'], chosen: 0, edited: 'Hola.' } as const,
    ]) {
      noteState.set(state);
      const { unmount } = render(LoveNotePanel, { props: { description: DESCRIPTION } });
      expect(screen.queryByRole('button', { name: /fill|send/i })).toBeNull();
      unmount();
    }
  });
});
