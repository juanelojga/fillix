import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import { judgePost } from './judge-post';
import { POST_NUM_CTX } from './post-budget';
import {
  closePrecondition,
  failingRows,
  mergeAuditReport,
  runDeterministicRows,
  type AuditReport,
  type AuditRow,
} from './post-audit';
import { buildRepairPrompt, repairSystemPrompt } from './audit-prompt';
import { buildPostPrompt, postSystemPrompt } from './post-prompt';
import { closeKindFor, normalizePostDraft, type PostDraft } from './post-draft';
import type { AngleBrief, HookVariant } from './write-brief';

/**
 * Stage 3: write the post, audit it, and repair what the audit found.
 *
 * The loop lives here and the parser lives in `post-draft.ts`, so this file has exactly one
 * reason to change — how many passes are worth spending — and that one has another: what a
 * post is.
 */

/** `answers/draft-answer.ts`'s reasoning: roughly twice the longest output we expect. */
export const POST_NUM_PREDICT = 1_536;

/** Bounds the repairs, not the result — see `writePost`. */
export const POST_TIMEOUT_MS = 300_000;

export const MAX_REPAIR_PASSES = 2;

export interface PostResult {
  draft: PostDraft;
  report: AuditReport;
  /** 0 when it passed first time. */
  passes: number;
  /** True when the cap or the clock ran out with rows still failing. */
  exhausted: boolean;
}

export interface WritePostInput {
  brief: AngleBrief;
  hook: HookVariant;
  research: string;
  specifics: string;
  voiceSpec: string;
}

async function generateDraft(
  config: OllamaConfig,
  system: string,
  prompt: string,
  brief: AngleBrief,
  signal: AbortSignal,
): Promise<PostDraft> {
  const raw = await generateStructured<Record<string, unknown>>(config, system, prompt, signal, {
    num_ctx: POST_NUM_CTX,
    num_predict: POST_NUM_PREDICT,
  });
  return normalizePostDraft(raw, closeKindFor(brief.funnel));
}

/**
 * Audits one draft.
 *
 * The deterministic rows run first, and the model is asked **only if they all pass**. That
 * ordering saves a whole generation on a 700-character post, and it means the repair prompt
 * always receives the unambiguous failures first, where they are cheapest to fix.
 */
async function audit(
  config: OllamaConfig,
  draft: PostDraft,
  input: WritePostInput,
  signal: AbortSignal,
): Promise<AuditReport> {
  const deterministic: AuditRow[] = [...runDeterministicRows(draft), closePrecondition(draft)];

  if (deterministic.some((row) => !row.pass)) {
    return mergeAuditReport(deterministic, []);
  }

  const verdicts = await judgePost(config, draft, input.brief, input.voiceSpec, signal);
  return mergeAuditReport(deterministic, verdicts);
}

/**
 * Writes the post and repairs it up to `MAX_REPAIR_PASSES` times.
 *
 * On exhaustion — the cap reached, or the signal aborted between passes — it **returns the
 * best draft it has with its failing report**, and only propagates an error if the abort lands
 * during the very first generation, when there is no draft to return.
 *
 * That is inverted from `draft-answer.ts`, deliberately. There a guard throws because there is
 * no safe repair for a fabricated claim in front of a recruiter. Here every failure has a named
 * repair and the human is the last step by design — the post goes to a clipboard, not to
 * LinkedIn — so a 1,150-character post with everything else green is a five-second fix, and
 * discarding it would cost four generations to get back. The panel renders the failing rows.
 */
export async function writePost(
  config: OllamaConfig,
  input: WritePostInput,
  signal: AbortSignal,
): Promise<PostResult> {
  let draft = await generateDraft(
    config,
    postSystemPrompt(input.voiceSpec, closeKindFor(input.brief.funnel)),
    buildPostPrompt(input),
    input.brief,
    signal,
  );
  let report = await audit(config, draft, input, signal);
  let passes = 0;

  while (!report.passed && passes < MAX_REPAIR_PASSES) {
    if (signal.aborted) return { draft, report, passes, exhausted: true };

    const failures = failingRows(report);
    let repaired: PostDraft;
    try {
      repaired = await generateDraft(
        config,
        repairSystemPrompt(input.voiceSpec),
        buildRepairPrompt(draft, failures),
        input.brief,
        signal,
      );
    } catch {
      // A failed repair is not a failed run: the draft before it is still the user's post, and
      // the report already says what is wrong with it.
      return { draft, report, passes, exhausted: true };
    }

    passes += 1;
    draft = repaired;
    report = await audit(config, draft, input, signal);
  }

  return { draft, report, passes, exhausted: !report.passed };
}
