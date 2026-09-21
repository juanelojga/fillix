import { derived, get, writable } from 'svelte/store';
import type { AnswerDraft } from '../../lib/answers/draft-answer';
import { assembleAnswerEvidence } from '../../lib/answers/answer-evidence';
import { checkQuestionSchedule } from '../../lib/answers/question-schedule';
import { requestQuestionTimes } from '../../lib/answers/question-times-port';
import type { ScheduleCheck } from '../../lib/answers/schedule-check';
import { diagnoseDraftFailure, type DraftDiagnosis } from '../../lib/answers/draft-diagnostics';
import {
  diagnoseRetrievalFailure,
  type RetrievalDiagnosis,
} from '../../lib/profile/retrieval-diagnostics';
import {
  APPLICATION_FORM_ANCHOR,
  extractApplicationFields,
  type ApplicationField,
} from '../../lib/playbooks/toptal-application-form';
import { fillActiveTab, type FillOutcome } from '../../lib/capture/fill-active-tab';
import {
  diagnoseCaptureFailure,
  type CaptureDiagnosis,
} from '../../lib/capture/capture-diagnostics';
import { TOPTAL_JOB_PAGE } from '../../lib/playbooks/toptal-job-url';
import type { Message, MessageResponse } from '../../types';
import { applicantName } from '../../lib/profile/applicant-name';
import { profile, retrieveProfileContext } from './profile';
import { availability, browserTimeZone } from './availability';
import { runState } from './playbook';
import { effectiveWorkflowModel } from './settings';

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
  /**
   * `schedule` is what the question's own times came to against the stored hours, or null when
   * it named none. Kept beside the draft rather than folded into it because the model did not
   * produce it — it was computed before the model ran, and the card shows it as a separate,
   * checkable fact rather than as part of what was written.
   */
  | { status: 'drafted'; draft: AnswerDraft; edited: string; schedule: ScheduleCheck | null }
  | { status: 'failed'; diagnosis: DraftDiagnosis | RetrievalDiagnosis };

/** The questions on the captured form, in the order the page shows them. */
export const fields = writable<ApplicationField[]>([]);

/** Keyed by question text, which `extractApplicationFields` guarantees is what identifies one. */
export const drafts = writable<Record<string, DraftState>>({});

export const draftingAll = writable(false);

export type FillState =
  | { status: 'idle' }
  | { status: 'filling' }
  /** Per question, so a miss is shown against the field it missed. */
  | { status: 'done'; outcomes: Record<string, FillOutcome> }
  | { status: 'refused'; diagnosis: CaptureDiagnosis };

export const fillState = writable<FillState>({ status: 'idle' });

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
  fillState.set({ status: 'idle' });
});

export function clearApplication(): void {
  capturedAt = 0;
  fields.set([]);
  drafts.set({});
  draftingAll.set(false);
  fillState.set({ status: 'idle' });
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

  // Read once, before either round trip, for the reason `stores/news.ts` states: the two
  // generations and the failure wording must all name the model that actually ran, and the
  // header's picker is never disabled. Per question rather than per `draftAll`, because
  // `redraft` enters here directly.
  const model = get(effectiveWorkflowModel);

  // What the model is shown is decided in `lib/answers/answer-evidence.ts`, not here: the panel
  // supplies the stored values and the two impure steps, and that module owns the ordering the
  // grounding design depends on.
  const assembled = await assembleAnswerEvidence(
    {
      kind: field.kind === 'pitch' ? 'pitch' : 'question',
      question: field.question,
      brief,
      availability: get(availability),
      browserTimeZone: browserTimeZone(),
    },
    {
      // The model reaches the extraction as a bound source rather than as one more
      // parameter of `checkQuestionSchedule`: that module is a pure function of the times
      // it is handed and has no business knowing about transport. Same shape the eval uses.
      checkSchedule: (question, weeklyHours, timeZone, at) =>
        checkQuestionSchedule(question, weeklyHours, timeZone, at, (q) =>
          requestQuestionTimes(q, model),
        ),
      retrieve: retrieveProfileContext,
    },
  );

  if (!assembled.ok) {
    setDraft(
      field.question,
      { status: 'failed', diagnosis: diagnoseRetrievalFailure(assembled.failure) },
      generation,
    );
    return;
  }

  const msg: Message = {
    type: 'DRAFT_ANSWER',
    kind: field.kind === 'pitch' ? 'pitch' : 'question',
    question: field.question,
    job: assembled.job,
    evidence: assembled.evidence,
    // Sent for every field; only the pitch prompt reads it. Resolved here rather than in the
    // worker because the profile document lives in the panel and never crosses the port.
    applicantName: applicantName(get(profile).markdown),
    // '' means "follow the active model", and the worker already reads it that way.
    model: model || undefined,
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
      { status: 'failed', diagnosis: diagnoseDraftFailure(error, model || 'your model') },
      generation,
    );
    return;
  }

  setDraft(
    field.question,
    {
      status: 'drafted',
      draft: response.draft,
      edited: response.draft.text,
      schedule: assembled.schedule,
    },
    generation,
  );
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

/** What would be written: every approved, non-empty answer, against its locator. */
export const fillable = derived([fields, drafts], ([$fields, $drafts]) =>
  $fields.flatMap((field) => {
    if (field.locator === null) return [];
    const state = $drafts[field.question];
    if (state?.status !== 'drafted') return [];
    const value = state.edited.trim();
    // A blank answer is left alone rather than written as an empty string: clearing a box the
    // user had already typed in would be a silent deletion of their own work.
    return value ? [{ question: field.question, locator: field.locator, value }] : [];
  }),
);

/**
 * Writes the approved answers into the page.
 *
 * Re-verifies the page requirement first, through the same pre-flight the capture uses: the
 * user may have switched tabs since drafting, and writing a pitch into whatever happens to be
 * open now is the worst thing this feature could do. Submit is never pressed.
 */
export async function fillApproved(): Promise<void> {
  if (get(fillState).status === 'filling') return;

  const requests = get(fillable);
  if (requests.length === 0) return;

  fillState.set({ status: 'filling' });
  const generation = capturedAt;

  const result = await fillActiveTab(
    TOPTAL_JOB_PAGE,
    requests.map(({ locator, value }) => ({ locator, value })),
    APPLICATION_FORM_ANCHOR,
  );

  if (generation !== capturedAt) return;

  if (!result.ok) {
    fillState.set({ status: 'refused', diagnosis: diagnoseCaptureFailure(result) });
    return;
  }

  // Zipped by position: fillActiveTab answers in the order it was asked.
  const outcomes: Record<string, FillOutcome> = {};
  result.outcomes.forEach((outcome, i) => {
    const request = requests[i];
    if (request) outcomes[request.question] = outcome;
  });

  fillState.set({ status: 'done', outcomes });
}
