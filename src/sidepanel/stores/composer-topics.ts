import { get } from 'svelte/store';
import { diagnosePostFailure } from '../../lib/linkedin/post-diagnostics';
import { composerState, nextToken, seed, setComposerState } from './composer';
import { send } from './composer-send';
import { effectiveWorkflowModel, ollamaConfig } from './settings';

/**
 * Stage 1: ask for topics, then hold the five that came back.
 *
 * Its own file rather than more of `composer.ts` because it changes for its own reason — the
 * pillar taxonomy and the suggestion prompt — while `composer.ts` changes when the session
 * invariant does.
 */

export async function startTopics(): Promise<void> {
  const state = get(composerState);
  if (state.stage === 'topics' && state.status === 'running') return;

  const token = nextToken();

  // Read once, before the round trip, for `stores/news.ts`'s reason: the worker is told exactly
  // this model, and `diagnosePostFailure` names the same string, so a picker change mid-flight
  // can no longer make the message on screen a lie. The picker is never disabled — the next
  // press simply picks up the change.
  const resolved = get(effectiveWorkflowModel);
  const model = resolved || 'the local model';
  const baseUrl = get(ollamaConfig)?.baseUrl ?? '';

  setComposerState(token, { stage: 'topics', status: 'running' });

  const result = await send({
    type: 'POST_TOPICS',
    seed: get(seed),
    model: resolved || undefined,
  });

  if (!result.ok) {
    setComposerState(token, {
      stage: 'topics',
      status: 'failed',
      diagnosis: diagnosePostFailure('topics', result.error, model, baseUrl),
    });
    return;
  }

  // Success arms are narrowed by payload key, so a response of the wrong shape has to be
  // caught here rather than assumed away.
  if (!('topics' in result)) {
    setComposerState(token, {
      stage: 'topics',
      status: 'failed',
      diagnosis: diagnosePostFailure(
        'topics',
        'The service worker returned an unexpected response',
        model,
        baseUrl,
      ),
    });
    return;
  }

  setComposerState(token, { stage: 'topics', status: 'ready', topics: result.topics });
}
