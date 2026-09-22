import { get } from 'svelte/store';
import { selectedHook } from '../../lib/linkedin/composer-stage';
import { diagnosePostFailure } from '../../lib/linkedin/post-diagnostics';
import {
  MODEL_ROW_IDS,
  closePrecondition,
  mergeAuditReport,
  runDeterministicRows,
  type AuditReport,
} from '../../lib/linkedin/post-audit';
import type { PostDraft } from '../../lib/linkedin/post-draft';
import type { PostSpecifics } from '../../lib/linkedin/post-specifics';
import type { TopicSuggestion } from '../../lib/linkedin/suggest-topics';
import type { TopicResearch } from '../../lib/linkedin/topic-research';
import type { AngleBrief, HookVariant } from '../../lib/linkedin/write-brief';
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
 * Stage 3: write the post, then let the user edit it.
 *
 * Its own file because it changes when the algorithm rules do, while stage 2 changes with the
 * research sources and stage 1 with the pillar taxonomy.
 */

interface DraftContext {
  topic: TopicSuggestion;
  brief: AngleBrief;
  hook: HookVariant;
  research: TopicResearch;
  specifics: PostSpecifics;
}

/**
 * Re-runs the rows a regex can settle, against the text the user has actually edited.
 *
 * Deterministic rows only, and locally: `post-audit-checks.ts` is pure and imported here as
 * well as in the worker, so a keystroke costs nothing. The model's four verdicts keep the
 * answer the judge gave — re-asking would spend a generation per character, and they were
 * true of a draft this one is still mostly made of. Regenerate is what gets them re-judged.
 */
function auditEdited(report: AuditReport, draft: PostDraft, edited: string): AuditReport {
  const edit: PostDraft = { ...draft, text: edited };
  const deterministic = [...runDeterministicRows(edit), closePrecondition(edit)];
  const judged = report.rows.filter((row) => MODEL_ROW_IDS.includes(row.id));
  return mergeAuditReport(deterministic, judged);
}

export async function writeDraft(): Promise<void> {
  const state = get(composerState);
  if (state.stage !== 'brief' || state.status !== 'ready') return;

  const hook = selectedHook(state);
  if (!hook) return;

  const token = nextToken();
  await runDraft(token, {
    topic: state.topic,
    brief: state.brief,
    hook,
    research: state.research,
    specifics: state.specifics,
  });
}

/** Writes the post again from the same brief and the same hook. */
export async function regenerateDraft(): Promise<void> {
  const state = get(composerState);
  if (state.stage !== 'draft' || state.status === 'writing') return;

  const token = nextToken();
  await runDraft(token, {
    topic: state.topic,
    brief: state.brief,
    hook: state.hook,
    research: state.research,
    specifics: state.specifics,
  });
}

async function runDraft(token: SessionToken, context: DraftContext): Promise<void> {
  // Read once, before the round trip: the worker is told exactly this model, and the failure
  // hint names the same string, so a picker change mid-flight cannot make either a lie.
  const resolved = get(effectiveWorkflowModel);
  const model = resolved || 'the local model';
  const baseUrl = get(ollamaConfig)?.baseUrl ?? '';

  setComposerState(token, { ...context, stage: 'draft', status: 'writing' });

  const written = await send({
    type: 'POST_WRITE',
    brief: context.brief,
    hook: context.hook,
    evidence: context.research.evidence,
    specifics: context.specifics.text,
    model: resolved || undefined,
  });
  if (!isCurrent(token)) return;

  const fail = (error: string): void => {
    setComposerState(token, {
      ...context,
      stage: 'draft',
      status: 'failed',
      diagnosis: diagnosePostFailure('draft', error, model, baseUrl),
    });
  };

  if (!written.ok) return fail(written.error);
  if (!('post' in written)) return fail('The service worker returned an unexpected response');

  setComposerState(token, {
    ...context,
    stage: 'draft',
    status: 'ready',
    result: written.post,
    edited: written.post.draft.text,
    report: written.post.report,
  });
}

/** A keystroke. No round trip — the deterministic rows are pure and run here. */
export function editPost(text: string): void {
  composerState.update((state) => {
    if (state.stage !== 'draft' || state.status !== 'ready') return state;
    return { ...state, edited: text, report: auditEdited(state.report, state.result.draft, text) };
  });
}
