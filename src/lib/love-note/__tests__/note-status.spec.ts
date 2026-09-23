import { describe, it, expect } from 'vitest';
import { describeNoteRun } from '../note-status';
import type { NoteState } from '../note-stage';
import type { NoteDiagnosis } from '../note-diagnostics';

const diagnosis: NoteDiagnosis = {
  cause: 'unknown',
  summary: 'Something broke',
  hint: 'Press Write messages to try again.',
  detail: 'raw error',
  context: 'writing the messages',
};

const ALL_STATES: NoteState[] = [
  { status: 'idle' },
  { status: 'running' },
  { status: 'ready', variants: [], chosen: 0, edited: '' },
  { status: 'ready', variants: ['Hola.', 'Chao.', 'Oye.'], chosen: 1, edited: 'Chao.' },
  { status: 'failed', diagnosis },
];

describe('describeNoteRun', () => {
  /**
   * The load-bearing test, the one `composer-status.spec.ts` runs for the same reason: each
   * diagnostics module's hints name the one button its own describer puts on screen, and
   * that stays true only while no other describer borrows the name.
   */
  it('never uses the word Capture or Suggest topics in any state', () => {
    for (const state of ALL_STATES) {
      const chrome = describeNoteRun(state);
      const strings = [chrome.label, chrome.statusLine, chrome.announcement].join(' ');
      expect(strings).not.toMatch(/captur/i);
      expect(strings).not.toMatch(/suggest topics/i);
    }
  });

  it('names its own verb in every state a failure can be seen in, so every hint stays true', () => {
    for (const state of ALL_STATES) {
      if (state.status === 'running') continue;
      expect(describeNoteRun(state).label).toBe('Write messages');
    }
  });

  it('is busy only while running, so the button is never stuck disabled', () => {
    for (const state of ALL_STATES) {
      expect(describeNoteRun(state).busy).toBe(state.status === 'running');
    }
  });

  it('announces nothing at rest — a live region that repeats itself is noise', () => {
    expect(describeNoteRun({ status: 'idle' }).announcement).toBe('');
  });

  it('counts the messages it actually got, not the three it asked for', () => {
    const one = describeNoteRun({
      status: 'ready',
      variants: ['Hola.'],
      chosen: 0,
      edited: 'Hola.',
    });
    expect(one.statusLine).toBe('1 message — pick one, edit, copy');
  });

  it('carries the diagnosis summary into the announcement, never a bare "failed"', () => {
    expect(describeNoteRun({ status: 'failed', diagnosis }).announcement).toContain(
      'Something broke',
    );
  });
});
