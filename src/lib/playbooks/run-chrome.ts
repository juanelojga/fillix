/**
 * The four strings the Workflows header shows, whichever kind of playbook is selected.
 *
 * One describer per playbook kind returns this, and `WorkflowsTab.svelte` picks between them
 * on `playbook.kind` without ever spelling a verb itself. That is what turns CLAUDE.md's
 * rule — "a button named Capture is on screen only while its hints are true" — from a
 * convention into a property of two pure functions, which `composer-status.spec.ts` asserts
 * by iterating every state.
 */
export interface RunChrome {
  /** The button's own text, busy state already folded in ('Capture' / 'Capturing…'). */
  label: string;
  /** Drives `disabled` and the spinner class only. */
  busy: boolean;
  /** The line under the "Workflows" heading. */
  statusLine: string;
  /** The persistent live region. '' when there is nothing new to announce. */
  announcement: string;
}
