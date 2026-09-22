import type { PostDiagnosis } from './post-diagnostics';
import type { PostSpecifics } from './post-specifics';
import type { TopicSuggestion } from './suggest-topics';
import type { TopicResearch } from './topic-research';
import type { AuditReport } from './post-audit';
import type { AngleBrief, HookVariant } from './write-brief';
import type { PostResult } from './write-post';

/**
 * The composer's stage machine.
 *
 * A type module rather than part of the store, so the pure describer in `composer-status.ts`
 * and every component can narrow against it without importing anything that touches
 * `chrome.*`.
 *
 * `idle` appears on the topics arm and nowhere else, for the reason `stores/news.ts` gives
 * about `SummaryState`: not being at a stage *is* that stage's idle. There is no such thing
 * as being at the brief stage without a topic, so naming one would be an arm no code can
 * reach and every component would still have to handle.
 */

/** Which round trip a failure happened on. `post-diagnostics.ts` takes one of these. */
export type PostStage = 'topics' | 'research' | 'brief' | 'draft' | 'audit';

export type TopicsState =
  | { stage: 'topics'; status: 'idle' }
  | { stage: 'topics'; status: 'running' }
  | { stage: 'topics'; status: 'ready'; topics: TopicSuggestion[] }
  | { stage: 'topics'; status: 'failed'; diagnosis: PostDiagnosis };

/**
 * Stage 2.
 *
 * The topic is hoisted out of the intersection because it is true of every arm — it is what
 * got us here, and it survives a failure so Regenerate does not send the user back to stage
 * one. Research and the brief are not true of every arm, so they appear only where they
 * exist, and no component needs an `if (!brief)` branch it can never reach.
 */
export type BriefState = { stage: 'brief'; topic: TopicSuggestion } & (
  | { status: 'researching' }
  | { status: 'writing'; research: TopicResearch }
  | {
      status: 'ready';
      research: TopicResearch;
      brief: AngleBrief;
      specifics: PostSpecifics;
      /** Which of the three hooks the user picked. Always a valid index into `brief.hooks`. */
      hook: number;
    }
  | { status: 'failed'; research: TopicResearch | null; diagnosis: PostDiagnosis }
);

/**
 * Stage 3.
 *
 * Carries the research, the specifics and the chosen hook alongside the brief, because
 * Regenerate needs all four and re-running stage 2 to recover them would spend a web search
 * the user did not ask for.
 *
 * `edited` mirrors `stores/application.ts`'s `{ draft, edited }`: what the model wrote is kept
 * beside what the user made of it, so the audit re-runs against the text that will actually be
 * copied rather than the text the model produced.
 *
 * `report` is separate from `result.report` for that same reason — the model's own audit is
 * fixed at the moment it ran, while this one is recomputed on every keystroke.
 */
export type DraftState = {
  stage: 'draft';
  topic: TopicSuggestion;
  brief: AngleBrief;
  hook: HookVariant;
  research: TopicResearch;
  specifics: PostSpecifics;
} & (
  | { status: 'writing' }
  | { status: 'ready'; result: PostResult; edited: string; report: AuditReport }
  | { status: 'failed'; diagnosis: PostDiagnosis }
);

export type ComposerState = TopicsState | BriefState | DraftState;

/** The hook the user has settled on, or null when there is nothing to settle on yet. */
export function selectedHook(state: ComposerState): HookVariant | null {
  if (state.stage !== 'brief' || state.status !== 'ready') return null;
  return state.brief.hooks[state.hook] ?? null;
}

export const INITIAL_COMPOSER_STATE: ComposerState = { stage: 'topics', status: 'idle' };
