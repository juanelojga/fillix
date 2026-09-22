import type { CaptureFailure } from '../capture/active-tab-html';
import type { PageCapture } from '../capture/html-budget';
import type { CapturedSection } from './playbook';
import type { JobBrief } from './job-brief';

/**
 * The result of one capture playbook run.
 *
 * Here rather than in `sidepanel/stores/playbook.ts`, which still owns the `writable` and
 * re-exports this type, so that `capture/capture-status.ts` can describe a run without a
 * `lib/` module importing a store that imports it back.
 */
export type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; capture: PageCapture; sections: CapturedSection[]; brief: JobBrief | null }
  | { status: 'failed'; failure: CaptureFailure };
