import type { RunChrome } from '../playbooks/run-chrome';
import type { RunState } from '../playbooks/run-state';
import { diagnoseCaptureFailure } from './capture-diagnostics';

/**
 * How a capture playbook's run reads in the Workflows header.
 *
 * Lifted out of `WorkflowsTab.svelte` unchanged when a second playbook kind arrived. The tab
 * now asks a describer instead of switching inline, so the word "Capture" appears in exactly
 * one of the two describers — which is the whole reason every "press Capture again" hint in
 * `capture-diagnostics.ts` stays true.
 */
export function describeCaptureRun(state: RunState): RunChrome {
  switch (state.status) {
    case 'idle':
      return {
        label: 'Capture',
        busy: false,
        statusLine: 'Nothing captured yet — press Capture',
        announcement: '',
      };
    case 'running':
      return {
        label: 'Capturing…',
        busy: true,
        statusLine: 'Reading the active tab…',
        announcement: 'Reading the active tab.',
      };
    case 'ready': {
      const time = new Date(state.capture.capturedAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
      return {
        label: 'Capture',
        busy: false,
        statusLine: `Captured ${time}`,
        announcement: 'Page captured.',
      };
    }
    case 'failed':
      return {
        label: 'Capture',
        busy: false,
        statusLine: "Couldn't capture the page",
        announcement: `Capture failed. ${diagnoseCaptureFailure(state.failure).summary}`,
      };
  }
}
