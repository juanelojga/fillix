import type { RunChrome } from '../playbooks/run-chrome';
import type { BriefState, ComposerState, DraftState, TopicsState } from './composer-stage';

/**
 * How a composer run reads in the Workflows header.
 *
 * The twin of `capture/capture-status.ts`, and the reason both exist: the word **Capture**
 * must never appear here. Every hint in `capture-diagnostics.ts` tells the user to "press
 * Capture again", and those stay true only while exactly one button carries that name — so a
 * composer's header button is named for its own verb, and `composer-status.spec.ts` iterates
 * every state to prove it.
 *
 * The header button is only ever the session's entry point. Every stage advance — picking a
 * topic, approving an angle, regenerating — is a button inside the body, which is the rule
 * `ApplicationDrafts.svelte` already follows with "Draft answers". From stage two onwards it
 * therefore reads **Start over**, because starting over is the only thing the header can
 * still do.
 */

/** Switching on `stage` first, not `status`: all three stages share status names. */
export function describeComposerRun(state: ComposerState): RunChrome {
  switch (state.stage) {
    case 'topics':
      return describeTopics(state);
    case 'brief':
      return describeBrief(state);
    case 'draft':
      return describeDraft(state);
  }
}

function describeTopics(state: TopicsState): RunChrome {
  switch (state.status) {
    case 'idle':
      return {
        label: 'Suggest topics',
        busy: false,
        statusLine: 'No topics yet — press Suggest topics',
        announcement: '',
      };
    case 'running':
      return {
        label: 'Suggesting…',
        busy: true,
        statusLine: 'Reading your pillars…',
        announcement: 'Suggesting topics.',
      };
    case 'ready':
      return {
        label: 'New topics',
        busy: false,
        statusLine: `${state.topics.length} ${state.topics.length === 1 ? 'topic' : 'topics'} — pick one`,
        announcement: `${state.topics.length} topics suggested.`,
      };
    case 'failed':
      return {
        label: 'Suggest topics',
        busy: false,
        statusLine: "Couldn't suggest topics",
        announcement: `Suggesting topics failed. ${state.diagnosis.summary}`,
      };
  }
}

function describeBrief(state: BriefState): RunChrome {
  const base = { label: 'Start over', busy: false };
  switch (state.status) {
    case 'researching':
      return {
        ...base,
        busy: true,
        statusLine: 'Searching the web and Hacker News…',
        announcement: 'Researching the topic.',
      };
    case 'writing':
      return {
        ...base,
        busy: true,
        statusLine: 'Working out the angle…',
        announcement: 'Writing the angle.',
      };
    case 'ready':
      return {
        ...base,
        statusLine: 'Angle ready — pick a hook',
        announcement: 'Angle ready.',
      };
    case 'failed':
      return {
        ...base,
        statusLine: "Couldn't work out the angle",
        announcement: `The angle failed. ${state.diagnosis.summary}`,
      };
  }
}

function describeDraft(state: DraftState): RunChrome {
  const base = { label: 'Start over', busy: false };
  switch (state.status) {
    case 'writing':
      return {
        ...base,
        busy: true,
        statusLine: 'Writing the post…',
        announcement: 'Writing the post.',
      };
    case 'ready': {
      const failed = state.report.rows.filter((row) => !row.pass).length;
      const count = `${state.edited.length.toLocaleString()} characters`;
      return {
        ...base,
        statusLine: failed === 0 ? `Draft ready — ${count}` : `${count} · ${failed} checks failed`,
        announcement: failed === 0 ? 'Draft ready.' : `Draft ready with ${failed} checks failed.`,
      };
    }
    case 'failed':
      return {
        ...base,
        statusLine: "Couldn't write the post",
        announcement: `Writing the post failed. ${state.diagnosis.summary}`,
      };
  }
}
