import { get } from 'svelte/store';
import { diagnoseNoteFailure } from '../../lib/love-note/note-diagnostics';
import { send } from './composer-send';
import { nextNoteToken, noteSeed, noteState, setNoteState } from './love-note';
import { effectiveWorkflowModel, ollamaConfig } from './settings';

/**
 * The one round trip: the seed out, three messages back. Regenerate is this same function —
 * there is nothing to carry over, since the seed is still in its box.
 *
 * Its own file rather than more of `love-note.ts`, the `composer-topics.ts` split: this
 * changes when the message contract does, that one when the session invariant does.
 */
export async function writeNotes(): Promise<void> {
  if (get(noteState).status === 'running') return;

  const token = nextNoteToken();

  // Read once, before the round trip, for `stores/news.ts`'s reason: the worker is told exactly
  // this model and `diagnoseNoteFailure` names the same string, so a picker change mid-flight
  // cannot make the message on screen a lie.
  const resolved = get(effectiveWorkflowModel);
  const model = resolved || 'the local model';
  const baseUrl = get(ollamaConfig)?.baseUrl ?? '';

  setNoteState(token, { status: 'running' });

  const result = await send({
    type: 'NOTE_WRITE',
    seed: get(noteSeed),
    model: resolved || undefined,
  });

  if (!result.ok) {
    setNoteState(token, {
      status: 'failed',
      diagnosis: diagnoseNoteFailure(result.error, model, baseUrl),
    });
    return;
  }

  // Success arms are narrowed by payload key, so a response of the wrong shape has to be
  // caught here rather than assumed away.
  if (!('notes' in result)) {
    setNoteState(token, {
      status: 'failed',
      diagnosis: diagnoseNoteFailure(
        'The service worker returned an unexpected response',
        model,
        baseUrl,
      ),
    });
    return;
  }

  setNoteState(token, {
    status: 'ready',
    variants: result.notes,
    chosen: 0,
    edited: result.notes[0] ?? '',
  });
}
