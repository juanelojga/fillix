import { get, writable } from 'svelte/store';
import { INITIAL_NOTE_STATE, type NoteState } from '../../lib/love-note/note-stage';
import { LOVE_NOTE_ID } from '../../lib/playbooks/love-note';
import { selectedPlaybookId } from './playbook';

/**
 * The love note's session: the last run's messages, which one is picked, and the seed the
 * user typed.
 *
 * In a store rather than in `WorkflowsTab` for `stores/composer.ts`'s reason — bits-ui
 * unmounts the inactive TabsContent, so an in-flight round trip owned by a destroyed instance
 * would resolve into nothing. Session-only for the same reason too: an unsent message is the
 * user's unpublished writing.
 */
export const noteState = writable<NoteState>(INITIAL_NOTE_STATE);

/** What the user typed before pressing the button. '' is a supported, ordinary input. */
export const noteSeed = writable<string>('');

/** The token every async writer carries. Opaque: the only thing to do with one is hand it back. */
export type NoteToken = number;

let token: NoteToken = 0;

/** Starts a new session and returns its token. Every invalidating action calls this. */
export function nextNoteToken(): NoteToken {
  token += 1;
  return token;
}

export function isCurrentNote(candidate: NoteToken): boolean {
  return candidate === token;
}

/**
 * The only *async* writer of `noteState`. A write from a superseded session is dropped here,
 * `composer.ts`'s `setComposerState`: a forgotten check is three messages landing under a
 * playbook the user has already left.
 */
export function setNoteState(candidate: NoteToken, next: NoteState): void {
  if (!isCurrentNote(candidate)) return;
  noteState.set(next);
}

/**
 * No round trip — the user settling on one of the messages already on screen. Edits to the
 * previously picked one are discarded: `edited` is the text of *this* variant, and keeping
 * one draft per card would mean copying something the user cannot see.
 */
export function pickNote(index: number): void {
  noteState.update((state) => {
    if (state.status !== 'ready') return state;
    const variant = state.variants[index];
    if (variant === undefined) return state;
    return { ...state, chosen: index, edited: variant };
  });
}

export function editNote(text: string): void {
  noteState.update((state) => (state.status === 'ready' ? { ...state, edited: text } : state));
}

/**
 * Back to empty.
 *
 * A no-op when the session is already empty, so the module-scope subscription below — which
 * fires synchronously on the first import — does not bump the token before anything has run.
 */
export function resetLoveNote(): void {
  if (get(noteState).status === 'idle' && !get(noteSeed)) return;
  nextNoteToken();
  noteState.set(INITIAL_NOTE_STATE);
  noteSeed.set('');
}

/**
 * The session follows the selected playbook, and nothing else clears it. At module scope
 * and here rather than in `selectPlaybook`, for the two reasons `stores/composer.ts` gives.
 */
selectedPlaybookId.subscribe((id) => {
  if (id !== LOVE_NOTE_ID) resetLoveNote();
});
