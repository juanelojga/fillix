import {
  assembleAnswerEvidence,
  type AssembledEvidence,
  type EvidenceDeps,
} from '../../src/lib/answers/answer-evidence';
import {
  draftAnswer,
  DRAFT_TIMEOUT_MS,
  type AnswerDraft,
} from '../../src/lib/answers/draft-answer';
import { checkQuestionSchedule } from '../../src/lib/answers/question-schedule';
import { extractQuestionTimes } from '../../src/lib/answers/extract-question-times';
import { retrieveFromIndex, type QueryEmbedder } from '../../src/lib/profile/profile-retrieval';
import { applicantName } from '../../src/lib/profile/applicant-name';
import type { WeeklyAvailability } from '../../src/lib/profile/availability';
import type { ProfileIndex } from '../../src/lib/storage';
import type { OllamaConfig } from '../../src/types';
import type { GoldenCase, GoldenJob } from './golden.ts';
import { toJobBrief } from './golden.ts';

/**
 * Run one golden case through the production drafting pipeline.
 *
 * The whole point is that nothing here reimplements `draftOne` from
 * `sidepanel/stores/application.ts`: the evidence budget, the availability block's position and
 * the `'\n\n---\n\n'` separator all live in `assembleAnswerEvidence`, and this calls it. A copy
 * of those twenty lines is exactly the drift that would let the harness grade a pipeline the
 * extension does not run.
 *
 * The two impure steps arrive as `EvidenceDeps`, which is why that seam exists at all.
 */
export interface CaseWorld {
  chat: OllamaConfig;
  embed: QueryEmbedder;
  embedModel: string;
  markdown: string;
  index: ProfileIndex;
  availability: WeeklyAvailability;
}

export type CaseRun =
  | { ok: true; assembled: Extract<AssembledEvidence, { ok: true }>; draft: AnswerDraft }
  /** A refusal or a throw is a graded row, never a crashed run: a model that cannot answer is
   * a result, and losing the other seventy-two cases to it would not be. */
  | { ok: false; stage: 'evidence' | 'draft'; error: string; assembled: AssembledEvidence | null };

/**
 * The worker's side of `EXTRACT_QUESTION_TIMES`, reproduced including the port's JSON
 * round-trip.
 *
 * The round-trip is not ceremony. `question-schedule.ts` normalizes whatever the port hands
 * back, so what it receives has to be a plain record that survived `structuredClone`, not the
 * live `QuestionTimes` object. Calling `extractQuestionTimes` and passing the result straight
 * on would grade a pipeline one message boundary shorter than the one that ships.
 */
function questionTimesSource(chat: OllamaConfig, signal: AbortSignal) {
  return async (question: string): Promise<Record<string, unknown> | null> => {
    try {
      const times = await extractQuestionTimes(chat, question, signal, new Date());
      return JSON.parse(JSON.stringify(times)) as Record<string, unknown>;
    } catch {
      // The panel treats an extraction failure as "no schedule" and drafts on the weekly hours
      // alone. Throwing here would make a flaky extraction look like a drafting failure.
      return null;
    }
  };
}

export async function runCase(
  world: CaseWorld,
  job: GoldenJob,
  c: GoldenCase,
  signal: AbortSignal,
): Promise<CaseRun> {
  const now = new Date(c.now);
  const brief = toJobBrief(job);

  const deps: EvidenceDeps = {
    checkSchedule: (question, availability, timeZone, at) =>
      checkQuestionSchedule(
        question,
        availability,
        timeZone,
        at,
        questionTimesSource(world.chat, signal),
      ),
    retrieve: (query, budgetChars) =>
      retrieveFromIndex(
        { embedModel: world.embedModel, markdown: world.markdown, index: world.index },
        query,
        budgetChars,
        world.embed,
      ),
  };

  let assembled: AssembledEvidence;
  try {
    assembled = await assembleAnswerEvidence(
      {
        kind: c.kind,
        question: c.question,
        brief,
        availability: world.availability,
        browserTimeZone: c.browserTimeZone,
        now,
      },
      deps,
    );
  } catch (err) {
    return { ok: false, stage: 'evidence', error: message(err), assembled: null };
  }

  if (!assembled.ok) {
    return { ok: false, stage: 'evidence', error: assembled.failure.reason, assembled };
  }

  try {
    const draft = await draftAnswer(
      world.chat,
      {
        kind: c.kind,
        question: c.question,
        job: assembled.job,
        evidence: assembled.evidence,
        applicantName: applicantName(world.markdown),
      },
      signal,
    );
    return { ok: true, assembled, draft };
  } catch (err) {
    // The grounding guard throws from here. `grade-draft.ts` reads the message and scores it
    // against the case's expectation rather than treating it as an infrastructure failure.
    return { ok: false, stage: 'draft', error: message(err), assembled };
  }
}

export function caseSignal(): AbortSignal {
  return AbortSignal.timeout(DRAFT_TIMEOUT_MS);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
