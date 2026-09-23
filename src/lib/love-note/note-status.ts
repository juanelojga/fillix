import type { RunChrome } from '../playbooks/run-chrome';
import type { NoteState } from './note-stage';

/**
 * How a love-note run reads in the Workflows header.
 *
 * The third describer, beside `capture/capture-status.ts` and `linkedin/composer-status.ts`,
 * and bound by the same rule: the words **Capture** and **Suggest topics** must never appear
 * here, because each diagnostics module's hints name the one button its own describer puts
 * on screen. `note-status.spec.ts` iterates every state to prove it.
 *
 * The label is the same in every state but `running`, so a hint reading "press Write
 * messages" is true whenever a failure is visible.
 */
export function describeNoteRun(state: NoteState): RunChrome {
  switch (state.status) {
    case 'idle':
      return {
        label: 'Write messages',
        busy: false,
        statusLine: 'No messages yet — press Write messages',
        announcement: '',
      };
    case 'running':
      return {
        label: 'Writing…',
        busy: true,
        statusLine: 'Writing three messages…',
        announcement: 'Writing messages.',
      };
    case 'ready': {
      const n = state.variants.length;
      return {
        label: 'Write messages',
        busy: false,
        statusLine: `${n} ${n === 1 ? 'message' : 'messages'} — pick one, edit, copy`,
        announcement: `${n} ${n === 1 ? 'message' : 'messages'} written.`,
      };
    }
    case 'failed':
      return {
        label: 'Write messages',
        busy: false,
        statusLine: "Couldn't write the messages",
        announcement: `Writing messages failed. ${state.diagnosis.summary}`,
      };
  }
}
