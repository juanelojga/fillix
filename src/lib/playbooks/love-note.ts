import type { NotePlaybook } from './playbook';

/**
 * The love note, as a row in the Workflows picker.
 *
 * As thin as `linkedin-post.ts` and for the same reason: `playbooks/` is the menu of things
 * the user can pick, and everything this one actually does lives in `lib/love-note/` and
 * `sidepanel/stores/love-note*.ts`. What belongs here is the label, the empty state, and the
 * declaration that this is a note playbook rather than a capture or a compose.
 */
export const LOVE_NOTE_ID = 'love-note';

export const loveNotePlaybook: NotePlaybook = {
  kind: 'note',
  id: LOVE_NOTE_ID,
  label: 'Love note',
  description:
    'Type a seed — what to write about and a detail or two to work in — and Write messages ' +
    'drafts three romantic messages in Spanish, following the standing instructions you keep in ' +
    'Settings (her nickname, the tone, what to always or never say). Pick one, edit it, copy ' +
    'it. Everything runs on your machine, and nothing is ever sent for you.',
};
