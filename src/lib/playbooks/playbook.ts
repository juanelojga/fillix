import type { CaptureResult } from '../capture/active-tab-html';

/**
 * The playbooks the Workflows tab offers. Stored in `workflowsConfig.playbook`, so an id
 * is a persisted value: renaming one strands whoever had it selected, and `resolvePlaybook`
 * is what keeps that from being a stuck tab rather than a crash.
 */
export type PlaybookId = 'toptal';

export interface PlaybookDefinition {
  id: PlaybookId;
  /** Row in the picker, and the only place the playbook is named in the UI. */
  label: string;
  /** The tab's empty state: what this playbook reads, and what it does not do. */
  description: string;
  run: () => Promise<CaptureResult>;
}
