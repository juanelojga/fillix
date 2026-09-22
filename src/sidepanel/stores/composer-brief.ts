import { get } from 'svelte/store';
import type { PostStage } from '../../lib/linkedin/composer-stage';
import { diagnosePostFailure } from '../../lib/linkedin/post-diagnostics';
import type { TopicSuggestion } from '../../lib/linkedin/suggest-topics';
import type { TopicResearch } from '../../lib/linkedin/topic-research';
import {
  composerState,
  isCurrent,
  nextToken,
  setComposerState,
  type SessionToken,
} from './composer';
import { send } from './composer-send';
import { effectiveWorkflowModel, ollamaConfig } from './settings';

/**
 * Stage 2: research the chosen topic, then work out the angle.
 *
 * Its own file because it changes for its own reason — which sources are searched, and what
 * the brief asks for — while stage 1 changes with the pillar taxonomy.
 *
 * Two round trips rather than one, for the reason `stores/news.ts` states about fetch and
 * summarize: the user sees "Searching…" then "Working out the angle…" instead of forty
 * unchanging seconds, the failure stage is intrinsic rather than guessed, and each worker
 * invocation is short enough to dodge MV3's idle kill.
 */

/** Advances to stage 2 and starts the run. Bumps the session, so a stage-1 reply is dropped. */
export async function chooseTopic(title: string): Promise<void> {
  const state = get(composerState);
  if (state.stage !== 'topics' || state.status !== 'ready') return;

  const topic = state.topics.find((t) => t.title === title);
  if (!topic) return;

  const token = nextToken();
  await runBrief(token, topic);
}

/** Runs stage 2 again for the topic already chosen, from the failed or ready state. */
export async function regenerateBrief(): Promise<void> {
  const state = get(composerState);
  if (state.stage !== 'brief') return;
  if (state.status === 'researching' || state.status === 'writing') return;

  const token = nextToken();
  await runBrief(token, state.topic);
}

/** No round trip — the user settling on one of the three hooks already on screen. */
export function chooseHook(index: number): void {
  composerState.update((state) => {
    if (state.stage !== 'brief' || state.status !== 'ready') return state;
    if (index < 0 || index >= state.brief.hooks.length) return state;
    return { ...state, hook: index };
  });
}

async function runBrief(token: SessionToken, topic: TopicSuggestion): Promise<void> {
  // Read once, before either round trip, for `stores/news.ts`'s reason: both messages and
  // every diagnosis must name the model that actually ran, and the picker is never disabled.
  const resolved = get(effectiveWorkflowModel);
  const model = resolved || 'the local model';
  const baseUrl = get(ollamaConfig)?.baseUrl ?? '';

  const fail = (stage: PostStage, error: string, research: TopicResearch | null): void => {
    setComposerState(token, {
      stage: 'brief',
      topic,
      status: 'failed',
      research,
      diagnosis: diagnosePostFailure(stage, error, model, baseUrl),
    });
  };

  setComposerState(token, { stage: 'brief', topic, status: 'researching' });

  const researched = await send({ type: 'POST_RESEARCH', topic: topic.title });
  if (!isCurrent(token)) return;

  if (!researched.ok) return fail('research', researched.error, null);
  if (!('research' in researched)) {
    return fail('research', 'The service worker returned an unexpected response', null);
  }
  const research = researched.research;

  setComposerState(token, { stage: 'brief', topic, status: 'writing', research });

  const written = await send({
    type: 'POST_BRIEF',
    topic: topic.title,
    angle: topic.angle,
    pillar: topic.pillar,
    evidence: research.evidence,
    model: resolved || undefined,
  });
  if (!isCurrent(token)) return;

  // A research failure never reaches here — it degrades inside TopicResearch and the brief is
  // written from whatever arrived, the rule `news/aggregator.ts` and `availability-evidence.ts`
  // both follow. Only the generation failing fails the stage.
  if (!written.ok) return fail('brief', written.error, research);
  if (!('brief' in written)) {
    return fail('brief', 'The service worker returned an unexpected response', research);
  }

  setComposerState(token, {
    stage: 'brief',
    topic,
    status: 'ready',
    research,
    brief: written.brief,
    specifics: written.specifics,
    hook: 0,
  });
}
