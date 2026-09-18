import { buildAvailabilityEvidence } from './availability-evidence';
import { buildRetrievalQuery } from './answer-query';
import { buildJobContext } from './job-context';
import type { ScheduleCheck } from './schedule-check';
import type { JobBrief } from '../playbooks/job-brief';
import type { WeeklyAvailability } from '../profile/availability';
import type { RetrievalResult } from '../profile/profile-retrieval';
import type { RetrievalFailure } from '../profile/retrieval-diagnostics';
import type { RetrievedChunk } from '../profile/retrieve';

/**
 * What one question's prompt is built from.
 *
 * Lifted out of `sidepanel/stores/application.ts`, which was doing two jobs: holding the panel's
 * draft state, and deciding what the model is shown. The second is the one the whole grounding
 * design turns on, and it has to be runnable outside a browser so an eval can grade the real
 * assembly rather than a copy of it that drifts — the failure mode that let the schedule check
 * discard every extracted time for as long as it did.
 *
 * The two impure steps arrive as parameters. Everything else here is ordering, and the ordering
 * is the substance.
 */

/** Eight sections of profile is already most of a small model's usable context. */
export const EVIDENCE_CHARS = 6_000;

export interface EvidenceRequest {
  question: string;
  brief: JobBrief | null;
  availability: WeeklyAvailability;
  browserTimeZone: string;
  /** Injected so a fixture can freeze it; the panel passes the real clock. */
  now?: Date;
}

/** The two steps that leave this module: one extraction generation, one embed-and-score. */
export interface EvidenceDeps {
  checkSchedule: (
    question: string,
    availability: WeeklyAvailability,
    browserTimeZone: string,
    now: Date,
  ) => Promise<ScheduleCheck | null>;
  retrieve: (query: string, budgetChars: number) => Promise<RetrievalResult>;
}

export type AssembledEvidence =
  | {
      ok: true;
      /** `buildJobContext(brief)`, or '' when the page gave us no brief. */
      job: string;
      /** Exactly what `DRAFT_ANSWER` carries. */
      evidence: string;
      schedule: ScheduleCheck | null;
      /** Kept for the eval's citation check — the panel ignores both of these. */
      chunks: RetrievedChunk[];
      availabilityBlock: string;
    }
  /** The schedule rides along even on a refusal: it was computed before retrieval was asked. */
  | { ok: false; failure: RetrievalFailure; schedule: ScheduleCheck | null };

export async function assembleAnswerEvidence(
  request: EvidenceRequest,
  deps: EvidenceDeps,
): Promise<AssembledEvidence> {
  const now = request.now ?? new Date();

  // Before retrieval and before the model: any times the question itself names are converted
  // and intersected with the stored hours here, so the answer quotes an arithmetic result
  // instead of performing one. Null whenever that cannot be trusted — see `question-schedule`.
  const schedule = await deps.checkSchedule(
    request.question,
    request.availability,
    request.browserTimeZone,
    now,
  );

  // Charged against the same budget as the retrieved sections, not added on top. Injected
  // rather than retrieved because a schedule question must never depend on cosine similarity
  // finding the right section — and because everything in it is computed, not embedded.
  const availabilityBlock = buildAvailabilityEvidence(
    request.availability,
    request.brief,
    request.browserTimeZone,
    now,
    schedule,
  );

  const retrieved = await deps.retrieve(
    buildRetrievalQuery(request.question, request.brief),
    EVIDENCE_CHARS - availabilityBlock.length,
  );
  if (!retrieved.ok) return { ok: false, failure: retrieved, schedule };

  return {
    ok: true,
    job: request.brief ? buildJobContext(request.brief) : '',
    // Availability last: Ollama truncates an overflowing context from the start, which is
    // why `buildAnswerPrompt` already puts evidence last. Within it, last is safest.
    evidence: [...retrieved.chunks.map((c) => c.text), availabilityBlock]
      .filter(Boolean)
      .join('\n\n---\n\n'),
    schedule,
    chunks: retrieved.chunks,
    availabilityBlock,
  };
}
