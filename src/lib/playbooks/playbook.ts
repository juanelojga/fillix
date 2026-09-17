import type { CaptureFailure } from '../capture/active-tab-html';
import type { PageCapture } from '../capture/html-budget';
import type { JobBrief } from './job-brief';

/**
 * The playbooks the Workflows tab offers. Stored in `workflowsConfig.playbook`, so an id
 * is a persisted value: renaming one strands whoever had it selected, and `resolvePlaybook`
 * is what keeps that from being a stuck tab rather than a crash.
 */
export type PlaybookId = 'toptal';

/** One labelled block of the captured page, as text. */
export interface CapturedSection {
  heading: string;
  body: string;
  /** False when the page had no such section — worded on screen, never hidden. */
  found: boolean;
}

/**
 * What a run hands back. The failure arms are the capture's own, verbatim: a playbook adds
 * meaning to a success and has nothing to add to a refusal.
 */
export type PlaybookResult =
  | {
      ok: true;
      capture: PageCapture;
      sections: CapturedSection[];
      /** null when a playbook reads a page that is not a job posting. */
      brief: JobBrief | null;
    }
  | ({ ok: false } & CaptureFailure);

export interface PlaybookDefinition {
  id: PlaybookId;
  /** Row in the picker, and the only place the playbook is named in the UI. */
  label: string;
  /** The tab's empty state: what this playbook reads, and what it does not do. */
  description: string;
  run: () => Promise<PlaybookResult>;
}
