import { get, writable } from 'svelte/store';
import type { CaptureFailure } from '../../lib/capture/active-tab-html';
import type { PageCapture } from '../../lib/capture/html-budget';
import type { PlaybookId } from '../../lib/playbooks/playbook';
import { DEFAULT_PLAYBOOK_ID, resolvePlaybook } from '../../lib/playbooks/registry';
import { getWorkflowsConfig, setWorkflowsConfig } from '../../lib/storage';

export type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; capture: PageCapture }
  | { status: 'failed'; failure: CaptureFailure };

/**
 * Which playbook the tab runs, and the result of the last run.
 *
 * Both live here rather than in the component because bits-ui unmounts TabsContent for
 * the inactive tab, so state held in WorkflowsTab would vanish the moment the user
 * glanced at Chat — and an in-flight executeScript owned by a destroyed instance would
 * resolve into nothing.
 *
 * They also live in the *same* store because they share one invariant: the displayed
 * result always belongs to the displayed playbook. Splitting them would make selection
 * and running import each other.
 */
export const selectedPlaybookId = writable<PlaybookId>(DEFAULT_PLAYBOOK_ID);

/**
 * Session-only by design. The selected id is persisted; the result never is — a page's
 * full markup is the user's browsing content and nothing consumes it across sessions.
 */
export const runState = writable<RunState>({ status: 'idle' });

/** Bumped per run so a superseded run cannot overwrite a newer state. */
let generation = 0;

export async function hydratePlaybookSelection(): Promise<void> {
  const { playbook } = await getWorkflowsConfig();
  selectedPlaybookId.set(resolvePlaybook(playbook).id);
}

export async function selectPlaybook(id: PlaybookId): Promise<void> {
  if (get(selectedPlaybookId) === id) return;
  selectedPlaybookId.set(id);
  // clearRun, not a bare reset: it bumps the generation, so a run started under the
  // previous playbook cannot land under this one's label.
  clearRun();
  await setWorkflowsConfig({ playbook: id });
}

export async function runPlaybook(): Promise<void> {
  if (get(runState).status === 'running') return;
  generation += 1;
  const gen = generation;

  runState.set({ status: 'running' });
  const result = await resolvePlaybook(get(selectedPlaybookId)).run();
  if (gen !== generation) return;

  runState.set(
    result.ok
      ? { status: 'ready', capture: result.capture }
      : { status: 'failed', failure: result },
  );
}

export function clearRun(): void {
  generation += 1;
  runState.set({ status: 'idle' });
}
