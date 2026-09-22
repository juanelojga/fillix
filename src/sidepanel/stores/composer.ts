import { get, writable } from 'svelte/store';
import { INITIAL_COMPOSER_STATE, type ComposerState } from '../../lib/linkedin/composer-stage';
import { LINKEDIN_POST_ID } from '../../lib/playbooks/linkedin-post';
import { selectedPlaybookId } from './playbook';

/**
 * The composer's session: which stage it is on, and the seed the user typed.
 *
 * In a store rather than in `WorkflowsTab` for `stores/playbook.ts`'s reason — bits-ui
 * unmounts the inactive TabsContent, so a half-approved angle would vanish the moment the
 * user glanced at Chat, and an in-flight round trip owned by a destroyed instance would
 * resolve into nothing.
 *
 * Session-only, deliberately, and a step beyond the capture's argument. A page's markup is
 * the user's browsing content; an unposted draft is the user's unpublished writing. And
 * restoring a half-approved angle into a fresh panel would resume a decision the user has
 * forgotten making, with stage after stage of model output on screen looking exactly as
 * though it had just run.
 */
export const composerState = writable<ComposerState>(INITIAL_COMPOSER_STATE);

/** What the user typed before pressing the button. '' is a supported, ordinary input. */
export const seed = writable<string>('');

/**
 * The token every async stage writer carries.
 *
 * Opaque on purpose: the only thing a caller may do with one is hand it back. One counter
 * rather than one per stage, because every invalidating action has to bump it anyway and two
 * counters is two things to forget.
 */
export type SessionToken = number;

let token: SessionToken = 0;

/** Starts a new session and returns its token. Every invalidating action calls this. */
export function nextToken(): SessionToken {
  token += 1;
  return token;
}

/** For the gap between two round trips inside one stage. */
export function isCurrent(candidate: SessionToken): boolean {
  return candidate === token;
}

/**
 * The only writer of `composerState`.
 *
 * A write from a superseded session is dropped here rather than by a hand-written
 * `if (gen !== generation) return` at every call site — `stores/application.ts` takes the
 * same approach with `setDraft`, and the generalisation earns itself as soon as there are
 * more write sites than a reader can hold in their head. A forgotten check is a draft landing
 * under a topic the user has already moved on from.
 */
export function setComposerState(candidate: SessionToken, next: ComposerState): void {
  if (!isCurrent(candidate)) return;
  composerState.set(next);
}

/**
 * Back to an empty stage 1.
 *
 * A no-op when the session is already empty, so the module-scope subscription below — which
 * fires synchronously on the first import — does not bump the token before anything has run.
 */
export function resetComposer(): void {
  const state = get(composerState);
  if (state.stage === 'topics' && state.status === 'idle' && !get(seed)) return;
  nextToken();
  composerState.set(INITIAL_COMPOSER_STATE);
  seed.set('');
}

/**
 * The composer follows the selected playbook, and nothing else clears it.
 *
 * At module scope rather than in `WorkflowsTab`'s onMount, for `stores/application.ts`'s
 * reason: the invariant has to hold while the tab is unmounted, and a playbook switched
 * while the user was on Chat would otherwise leave a stale session to come back to.
 *
 * Here rather than inside `selectPlaybook` so the dependency points one way — otherwise
 * `stores/playbook.ts` becomes the place every future playbook registers its own cleanup.
 */
selectedPlaybookId.subscribe((id) => {
  if (id !== LINKEDIN_POST_ID) resetComposer();
});
