import { describe, it, expect } from 'vitest';
import { describeComposerRun } from '../composer-status';
import type { ComposerState } from '../composer-stage';
import type { PostDiagnosis } from '../post-diagnostics';

const diagnosis: PostDiagnosis = {
  stage: 'topics',
  cause: 'unknown',
  summary: 'Something broke',
  hint: 'Press Suggest topics to try again.',
  detail: 'raw error',
  context: 'suggesting topics',
};

const ALL_STATES: ComposerState[] = [
  { stage: 'topics', status: 'idle' },
  { stage: 'topics', status: 'running' },
  { stage: 'topics', status: 'ready', topics: [] },
  {
    stage: 'topics',
    status: 'ready',
    topics: [{ title: 'Boring tech ships', angle: 'Why', pillar: 'startups' }],
  },
  { stage: 'topics', status: 'failed', diagnosis },
];

describe('describeComposerRun', () => {
  /**
   * The load-bearing test, and the reason `PlaybookDefinition` gained a `kind` at all.
   *
   * Every hint in `capture/capture-diagnostics.ts` tells the user to "press Capture again",
   * and those stay true only while exactly one button carries that name. This asserts the
   * composer never puts a second one on screen — as a property of the function rather than
   * as a convention someone has to remember.
   */
  it('never uses the word Capture in any state', () => {
    for (const state of ALL_STATES) {
      const chrome = describeComposerRun(state);
      const strings = [chrome.label, chrome.statusLine, chrome.announcement].join(' ');
      expect(strings).not.toMatch(/captur/i);
    }
  });

  it('names its own verb, which the diagnostics hints also name', () => {
    expect(describeComposerRun({ stage: 'topics', status: 'idle' }).label).toBe('Suggest topics');
  });

  it('is busy only while running, so the button is never stuck disabled', () => {
    for (const state of ALL_STATES) {
      expect(describeComposerRun(state).busy).toBe(state.status === 'running');
    }
  });

  it('announces nothing at rest — a live region that repeats itself is noise', () => {
    expect(describeComposerRun({ stage: 'topics', status: 'idle' }).announcement).toBe('');
  });

  it('counts the topics it actually got, not the five it asked for', () => {
    const one = describeComposerRun({
      stage: 'topics',
      status: 'ready',
      topics: [{ title: 'A', angle: 'B', pillar: 'career' }],
    });
    expect(one.statusLine).toBe('1 topic — pick one');
  });

  it('carries the diagnosis summary into the announcement, never a bare "failed"', () => {
    const chrome = describeComposerRun({ stage: 'topics', status: 'failed', diagnosis });
    expect(chrome.announcement).toContain('Something broke');
  });
});
