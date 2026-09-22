import type { CaptureFailure } from '../capture/active-tab-html';
import type { PageCapture } from '../capture/html-budget';
import type { JobBrief } from './job-brief';

/**
 * The playbooks the Workflows tab offers. Stored in `workflowsConfig.playbook`, so an id
 * is a persisted value: renaming one strands whoever had it selected, and `resolvePlaybook`
 * is what keeps that from being a stuck tab rather than a crash.
 */
export type PlaybookId = 'toptal' | 'linkedin-post' | 'love-note';

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

interface PlaybookCommon {
  id: PlaybookId;
  /** Row in the picker, and the only place the playbook is named in the UI. */
  label: string;
  /** The tab's empty state: what this playbook does, and what it does not do. */
  description: string;
}

/**
 * Reads the page the user is looking at and hands back one result.
 *
 * The run button says **Capture** for exactly these, and that is what keeps every "press
 * Capture again" hint in `capture/capture-diagnostics.ts` true: those hints are reachable
 * only from `runState.status === 'failed'`, which is reachable only from this `run`.
 */
export interface CapturePlaybook extends PlaybookCommon {
  kind: 'capture';
  run: () => Promise<PlaybookResult>;
}

/**
 * Writes something, in stages the user approves one at a time.
 *
 * Deliberately has no `run`. There is no page to capture and no single result to hand back,
 * so a `PlaybookResult` would have to be fabricated — and widening that type instead would
 * make every consumer of a capture re-narrow it: `stores/playbook.ts`, `CaptureResult.svelte`
 * and `stores/application.ts`'s module-scope subscription all read `state.capture` today and
 * would each grow a branch no capture can reach. Keeping `run` on the capture arm means a
 * compose playbook cannot produce a `PlaybookResult`, cannot enter `runState`, and so cannot
 * reach any of them.
 *
 * Its stage machine lives in `sidepanel/stores/composer*.ts`, and its header button is named
 * by `linkedin/composer-status.ts`.
 */
export interface ComposePlaybook extends PlaybookCommon {
  kind: 'compose';
}

/**
 * Writes several variants of one short thing in a single round trip; the user picks one,
 * edits it and copies it. No page, no stages, and — for `ComposePlaybook`'s reason — no
 * `run` and no `PlaybookResult`.
 *
 * A kind of its own rather than a second compose: `kind` names a UI contract (which store,
 * which header describer, which body panel), and `WorkflowsTab` switches on it exhaustively.
 * Dispatching by id inside the compose branch would make "compose" mean two state machines
 * and would re-branch on an id `resolvePlaybook(id: string)` treats as untrusted storage.
 *
 * Its session lives in `sidepanel/stores/love-note*.ts`, and its header button is named by
 * `love-note/note-status.ts`.
 */
export interface NotePlaybook extends PlaybookCommon {
  kind: 'note';
}

export type PlaybookDefinition = CapturePlaybook | ComposePlaybook | NotePlaybook;
