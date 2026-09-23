import type { NoteDiagnosis } from './note-diagnostics';

/**
 * The love note's state machine — one round trip, so one `status` axis and no stages.
 *
 * A type module rather than part of the store, for `linkedin/composer-stage.ts`'s reason: the
 * pure describer in `note-status.ts` and every component narrow against it without importing
 * anything that touches `chrome.*`.
 */
export type NoteState =
  | { status: 'idle' }
  | { status: 'running' }
  | {
      status: 'ready';
      variants: string[];
      /** Always a valid index into `variants`; starts at 0, the `BriefState.hook` convention. */
      chosen: number;
      /** Starts as `variants[chosen]` and follows the user's keystrokes — what will be copied. */
      edited: string;
    }
  | { status: 'failed'; diagnosis: NoteDiagnosis };

export const INITIAL_NOTE_STATE: NoteState = { status: 'idle' };
