import { get, writable } from 'svelte/store';
import { captureActiveTabHtml, type CaptureFailure } from '../../lib/capture/active-tab-html';
import type { PageCapture } from '../../lib/capture/html-budget';

export type CaptureState =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'ready'; capture: PageCapture }
  | { status: 'failed'; failure: CaptureFailure };

/**
 * A store, not a rune: bits-ui unmounts TabsContent for the inactive tab, so a capture
 * held in the component would vanish the moment the user glanced at Chat — and an
 * in-flight executeScript owned by a destroyed instance would resolve into nothing.
 *
 * Session-only by design. Nothing here is written to chrome.storage: a page's full
 * markup is the user's browsing content and nothing yet consumes it across sessions.
 */
export const captureState = writable<CaptureState>({ status: 'idle' });

/** Bumped per run so a superseded capture cannot overwrite a newer one. */
let generation = 0;

export async function capturePage(): Promise<void> {
  if (get(captureState).status === 'capturing') return;
  generation += 1;
  const gen = generation;

  captureState.set({ status: 'capturing' });
  const result = await captureActiveTabHtml();
  if (gen !== generation) return;

  captureState.set(
    result.ok
      ? { status: 'ready', capture: result.capture }
      : { status: 'failed', failure: result },
  );
}

export function clearCapture(): void {
  generation += 1;
  captureState.set({ status: 'idle' });
}
