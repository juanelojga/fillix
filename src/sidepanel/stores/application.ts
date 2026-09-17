import { derived, get, writable } from 'svelte/store';
import type { AnswerDraft } from '../../lib/answers/draft-answer';
import { buildJobContext } from '../../lib/answers/job-context';
import { buildRetrievalQuery } from '../../lib/answers/answer-query';
import { diagnoseDraftFailure, type DraftDiagnosis } from '../../lib/answers/draft-diagnostics';
import {
  diagnoseRetrievalFailure,
  type RetrievalDiagnosis,
} from '../../lib/profile/retrieval-diagnostics';
import {
  extractApplicationFields,
  type ApplicationField,
} from '../../lib/playbooks/toptal-application-form';
import type { Message, MessageResponse } from '../../types';
import { retrieveProfileContext } from './profile';
import { runState } from './playbook';
import { ollamaConfig } from './settings';

/**
 * The application form's questions and their drafted answers.
 *
 * A sibling of `stores/playbook.ts` rather than part of it, because that store is already at
 * the size the repo splits at and this is a different concern: one holds what the page *is*,
 * this holds what we propose to write back to it.
 *
 * They are not independent, though, and the invariant is the same one `playbook.ts` states: a
 * displayed draft must belong to the displayed capture. That is enforced by keying every
 * in-flight draft on the capture's `capturedAt` and dropping anything that resolves against a
 * newer one — so a slow answer from the previous job cannot land under this one's question.
 */

export type DraftState =
  | { status: 'idle' }
  | { status: 'drafting' }
  | { status: 'drafted'; draft: AnswerDraft; edited: string }
  | { status: 'failed'; diagnosis: DraftDiagnosis | RetrievalDiagnosis };

/** The questions on the captured form, in the order the page shows them. */
export const fields = writable<ApplicationField[]>([]);

/** Keyed by question text, which `extractApplicationFields` guarantees is what identifies one. */
export const drafts = writable<Record<string, DraftState>>({});

export const draftingAll = writable(false);

/** Which capture the current fields and drafts belong to. 0 when there is none. */
let capturedAt = 0;

export const answerable = derived(fields, ($fields) => $fields.filter((f) => f.locator !== null));

export const draftedCount = derived(
  drafts,
  ($drafts) =>
    Object.values($drafts).filter((d) => d.status === 'drafted' && d.draft.text.trim()).length,
);

/**
 * The fields follow the capture, and nothing else sets them.
 *
 * Subscribing here rather than having the tab do it on mount keeps the invariant true while
 * the tab is unmounted — bits-ui drops the inactive TabsContent, and a capture taken while the
 * user was on Chat would otherwise leave stale questions behind for them to come back to.
 */
runState.subscribe((state) => {
  if (state.status !== 'ready') {
    if (capturedAt !== 0) clearApplication();
    return;
  }
  if (state.capture.capturedAt === capturedAt) return;
  capturedAt = state.capture.capturedAt;
  fields.set(extractApplicationFields(state.capture.html));
  drafts.set({});
});

export function clearApplication(): void {
  capturedAt = 0;
  fields.set([]);
  drafts.set({});
  draftingAll.set(false);
}

export function editDraft(question: string, text: string): void {
  drafts.update((all) => {
    const state = all[question];
    if (state?.status !== 'drafted') return all;
    return { ...all, [question]: { ...state, edited: text } };
  });
}

function setDraft(question: string, state: DraftState, generation: number): void {
  // The whole point of the generation check: a draft started under one capture must not land
  // under a later one, where it would sit under a question that may not even be on the page.
  if (generation !== capturedAt) return;
  drafts.update((all) => ({ ...all, [question]: state }));
}

async function draftOne(field: ApplicationField, generation: number): Promise<void> {
  setDraft(field.question, { status: 'drafting' }, generation);

  const state = get(runState);
  const brief = state.status === 'ready' ? state.brief : null;

  const retrieved = await retrieveProfileContext(
    buildRetrievalQuery(field.question, brief),
    EVIDENCE_CHARS,
  );
  if (!retrieved.ok) {
    setDraft(
      field.question,
      { status: 'failed', diagnosis: diagnoseRetrievalFailure(retrieved) },
      generation,
    );
    return;
  }

  const msg: Message = {
    type: 'DRAFT_ANSWER',
    kind: field.kind === 'pitch' ? 'pitch' : 'question',
    question: field.question,
    job: brief ? buildJobContext(brief) : '',
    evidence: retrieved.chunks.map((c) => c.text).join('\n\n---\n\n'),
  };

  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;

  if (!response || !response.ok || !('draft' in response)) {
    const error = !response
      ? 'No response from the extension service worker'
      : response.ok
        ? 'Unexpected response shape'
        : response.error;
    setDraft(
      field.question,
      { status: 'failed', diagnosis: diagnoseDraftFailure(error, modelName()) },
      generation,
    );
    return;
  }

  setDraft(
    field.question,
    { status: 'drafted', draft: response.draft, edited: response.draft.text },
    generation,
  );
}

/** Eight sections of profile is already most of a small model's usable context. */
const EVIDENCE_CHARS = 6_000;

/**
 * Captured in the panel for the same reason the News tab resolves its summary model there: the
 * failure wording names a model, and reading it here — from the same store the worker's config
 * came from — is what keeps it from naming one that did not run.
 */
function modelName(): string {
  return get(ollamaConfig)?.model ?? 'your model';
}

export async function redraft(question: string): Promise<void> {
  const field = get(fields).find((f) => f.question === question);
  if (!field || field.locator === null) return;
  await draftOne(field, capturedAt);
}

/**
 * Drafts every answerable question, one at a time.
 *
 * Sequential rather than parallel: Ollama serialises generation on one model anyway, so firing
 * eight at once would not finish sooner — it would only make every one of them appear to hang
 * at the same time, with no way to read a partial result.
 */
export async function draftAll(): Promise<void> {
  if (get(draftingAll)) return;
  const generation = capturedAt;
  draftingAll.set(true);
  try {
    for (const field of get(answerable)) {
      if (generation !== capturedAt) return;
      await draftOne(field, generation);
    }
  } finally {
    draftingAll.set(false);
  }
}
