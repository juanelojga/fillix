import { appendToFile } from './obsidian';
import { runDraft, runPlan, runReview, runUnderstand } from './pipeline';
import { getObsidianConfig, getOllamaConfig, getProfile, getWorkflows } from './storage';
import { buildRunHeader, buildStageEntry } from './agent-log';
import { buildFieldFills } from './field-normalizer';
import type {
  ConversationMessage,
  DraftOutput,
  FieldFill,
  FieldSnapshot,
  PipelineStage,
  PlanOutput,
  ReviewOutput,
} from '../types';

// ── Gate factory ──────────────────────────────────────────────────────────────

export type GateResolution = { approved: true } | { approved: false; feedback: string };

export type Gate<T> = {
  wait: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
};

export type GateRegistry = {
  plan: Gate<GateResolution> | null;
  fills: Gate<GateResolution> | null;
};

export function createGate<T>(): Gate<T> {
  let _resolve!: (v: T) => void;
  let _reject!: (e: Error) => void;
  let settled = false;

  const promise = new Promise<T>((res, rej) => {
    _resolve = res;
    _reject = rej;
  });

  return {
    wait: () => promise,
    resolve: (v) => {
      if (!settled) {
        settled = true;
        _resolve(v);
      }
    },
    reject: (e) => {
      if (!settled) {
        settled = true;
        _reject(e);
      }
    },
  };
}

// ── Port message types ────────────────────────────────────────────────────────

export type AgentPortIn =
  | { type: 'AGENTIC_RUN'; workflowId: string; tabId: number }
  | { type: 'AGENTIC_PLAN_FEEDBACK'; approved: true }
  | { type: 'AGENTIC_PLAN_FEEDBACK'; approved: false; feedback: string }
  | { type: 'AGENTIC_FILLS_FEEDBACK'; approved: true }
  | { type: 'AGENTIC_FILLS_FEEDBACK'; approved: false; feedback: string }
  | { type: 'AGENTIC_CANCEL' };

export type AgentPortOut =
  | {
      type: 'AGENTIC_STAGE';
      stage: PipelineStage;
      status: 'running' | 'done' | 'error';
      summary?: string;
      durationMs?: number;
    }
  | { type: 'AGENTIC_PLAN_REVIEW'; plan: PlanOutput }
  | { type: 'AGENTIC_FILLS_REVIEW'; kind: 'form'; fills: FieldFill[] }
  | { type: 'AGENTIC_FILLS_REVIEW'; kind: 'reply'; replyText: string }
  | {
      type: 'AGENTIC_SUMMARY';
      applied: number;
      skipped: number;
      durationMs: number;
      wordCount?: number;
    }
  | { type: 'AGENTIC_ERROR'; stage: PipelineStage; error: string };

// ── Pipeline ──────────────────────────────────────────────────────────────────

const MAX_GATE_ITERATIONS = 5;

export async function runAgentPipeline(
  port: chrome.runtime.Port,
  workflowId: string,
  tabId: number,
  signal: AbortSignal,
  registry: GateRegistry,
): Promise<void> {
  const runStart = Date.now();
  const emit = (msg: AgentPortOut) => port.postMessage(msg);

  const ollamaConfig = await getOllamaConfig();
  const obsidianConfig = await getObsidianConfig();

  const workflows = await getWorkflows();
  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    emit({ type: 'AGENTIC_ERROR', stage: 'collect', error: `Workflow not found: ${workflowId}` });
    return;
  }

  if (signal.aborted) return;

  // ── Collect ────────────────────────────────────────────────────────────────

  emit({ type: 'AGENTIC_STAGE', stage: 'collect', status: 'running' });
  let fields: FieldSnapshot[] = [];

  if (workflow.taskType !== 'message-reply') {
    try {
      const resp = (await chrome.tabs.sendMessage(tabId, { type: 'DETECT_FIELDS' })) as
        | { ok: true; fields: FieldSnapshot[] }
        | { ok: false; error: string };
      if (!resp.ok) throw new Error(resp.error);
      fields = resp.fields;
    } catch (err) {
      const isNotConnected =
        err instanceof Error && err.message.includes('Could not establish connection');
      if (isNotConnected) {
        try {
          const manifest = chrome.runtime.getManifest();
          const file = manifest.content_scripts?.[0]?.js?.[0];
          if (!file) throw new Error('no content script in manifest');
          await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
          await new Promise<void>((r) => setTimeout(r, 50));
          const resp2 = (await chrome.tabs.sendMessage(tabId, { type: 'DETECT_FIELDS' })) as
            | { ok: true; fields: FieldSnapshot[] }
            | { ok: false; error: string };
          if (!resp2.ok) throw new Error(resp2.error);
          fields = resp2.fields;
        } catch {
          emit({
            type: 'AGENTIC_ERROR',
            stage: 'collect',
            error: 'Could not access this page. Try navigating to a regular web page.',
          });
          emit({ type: 'AGENTIC_STAGE', stage: 'collect', status: 'error' });
          return;
        }
      } else {
        const error = err instanceof Error ? err.message : String(err);
        emit({ type: 'AGENTIC_ERROR', stage: 'collect', error });
        emit({ type: 'AGENTIC_STAGE', stage: 'collect', status: 'error' });
        return;
      }
    }
  }
  emit({ type: 'AGENTIC_STAGE', stage: 'collect', status: 'done' });

  if (signal.aborted) return;

  let pageUrl = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    pageUrl = tab.url ?? '';
  } catch {
    // Non-critical; proceed without URL
  }

  const profile = await getProfile();
  const logPath = `fillix-logs/${new Date().toISOString().slice(0, 10)}.md`;
  appendToFile(obsidianConfig, logPath, buildRunHeader(workflow, pageUrl)).catch(() => {});

  if (signal.aborted) return;

  // ── Understand ─────────────────────────────────────────────────────────────

  emit({ type: 'AGENTIC_STAGE', stage: 'understand', status: 'running' });
  const understandStart = Date.now();
  let understand: Awaited<ReturnType<typeof runUnderstand>>;
  try {
    understand = await runUnderstand(ollamaConfig, workflow, fields, pageUrl, signal);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'AGENTIC_ERROR', stage: 'understand', error });
    emit({ type: 'AGENTIC_STAGE', stage: 'understand', status: 'error' });
    return;
  }
  const understandMs = Date.now() - understandStart;
  const understandSummary = `Task: ${understand.task_type}, ${understand.detected_fields?.length ?? 0} fields, confidence ${understand.confidence?.toFixed(2) ?? '0.00'}`;
  emit({
    type: 'AGENTIC_STAGE',
    stage: 'understand',
    status: 'done',
    summary: understandSummary,
    durationMs: understandMs,
  });
  appendToFile(
    obsidianConfig,
    logPath,
    buildStageEntry(
      'understand',
      understandMs,
      understandSummary,
      JSON.stringify(understand),
      workflow.logFullOutput,
    ),
  ).catch(() => {});

  if (signal.aborted) return;

  // ── Conversation extraction (message-reply only) ───────────────────────────

  let conversation: ConversationMessage[] = [];
  if (workflow.taskType === 'message-reply') {
    try {
      const convResp = (await chrome.tabs.sendMessage(tabId, {
        type: 'EXTRACT_CONVERSATION',
      })) as
        | { ok: true; messages: ConversationMessage[]; platform: string | null }
        | { ok: false; error: string };
      if (convResp.ok) conversation = convResp.messages;
    } catch {
      // Non-critical — empty conversation is a valid fallback
    }
  }

  if (signal.aborted) return;

  // ── Plan (with interactive gate) ───────────────────────────────────────────

  emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'running' });
  const planStart = Date.now();
  let currentPlan: Awaited<ReturnType<typeof runPlan>>;
  try {
    currentPlan = await runPlan(ollamaConfig, workflow, fields, understand, profile, signal, {
      conversation,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'AGENTIC_ERROR', stage: 'plan', error });
    emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'error' });
    return;
  }
  const planMs = Date.now() - planStart;
  const planSummary = `${currentPlan.fields_to_fill?.length ?? 0} fields to fill, ${currentPlan.missing_fields?.length ?? 0} missing`;
  emit({
    type: 'AGENTIC_STAGE',
    stage: 'plan',
    status: 'done',
    summary: planSummary,
    durationMs: planMs,
  });
  appendToFile(
    obsidianConfig,
    logPath,
    buildStageEntry(
      'plan',
      planMs,
      planSummary,
      JSON.stringify(currentPlan),
      workflow.logFullOutput,
    ),
  ).catch(() => {});

  if (!workflow.autoApply) {
    let planFeedbackCount = 0;
    while (true) {
      if (signal.aborted) return;
      const gate = createGate<GateResolution>();
      registry.plan = gate;
      emit({ type: 'AGENTIC_PLAN_REVIEW', plan: currentPlan });

      let resolution: GateResolution;
      try {
        resolution = await gate.wait();
      } catch {
        return;
      } finally {
        registry.plan = null;
      }

      if (resolution.approved) break;

      planFeedbackCount++;
      if (planFeedbackCount >= MAX_GATE_ITERATIONS) {
        emit({
          type: 'AGENTIC_ERROR',
          stage: 'plan',
          error: 'Max feedback iterations reached',
        });
        return;
      }

      if (signal.aborted) return;
      emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'running' });
      try {
        currentPlan = await runPlan(ollamaConfig, workflow, fields, understand, profile, signal, {
          feedback: resolution.feedback,
          conversation,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emit({ type: 'AGENTIC_ERROR', stage: 'plan', error });
        return;
      }
      emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'done' });
    }
  }

  if (signal.aborted) return;

  // ── Draft ──────────────────────────────────────────────────────────────────

  emit({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'running' });
  const draftStart = Date.now();
  let draft: DraftOutput;
  try {
    draft = await runDraft(ollamaConfig, workflow, fields, currentPlan, signal, { conversation });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'AGENTIC_ERROR', stage: 'draft', error });
    emit({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'error' });
    return;
  }
  const draftMs = Date.now() - draftStart;
  const draftSummary = `${Object.keys(draft).length} values drafted`;
  emit({
    type: 'AGENTIC_STAGE',
    stage: 'draft',
    status: 'done',
    summary: draftSummary,
    durationMs: draftMs,
  });
  appendToFile(
    obsidianConfig,
    logPath,
    buildStageEntry('draft', draftMs, draftSummary, JSON.stringify(draft), workflow.logFullOutput),
  ).catch(() => {});

  if (signal.aborted) return;

  // ── Review (optional) ──────────────────────────────────────────────────────

  let finalOutput: DraftOutput | ReviewOutput = draft;
  let isReview = false;
  if (workflow.review) {
    emit({ type: 'AGENTIC_STAGE', stage: 'review', status: 'running' });
    const reviewStart = Date.now();
    try {
      finalOutput = await runReview(ollamaConfig, workflow, draft, currentPlan, signal);
      isReview = true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({ type: 'AGENTIC_ERROR', stage: 'review', error });
      emit({ type: 'AGENTIC_STAGE', stage: 'review', status: 'error' });
      return;
    }
    const reviewMs = Date.now() - reviewStart;
    const reviewSummary = `${Object.keys(finalOutput).length} values reviewed`;
    emit({
      type: 'AGENTIC_STAGE',
      stage: 'review',
      status: 'done',
      summary: reviewSummary,
      durationMs: reviewMs,
    });
    appendToFile(
      obsidianConfig,
      logPath,
      buildStageEntry(
        'review',
        reviewMs,
        reviewSummary,
        JSON.stringify(finalOutput),
        workflow.logFullOutput,
      ),
    ).catch(() => {});
  }

  if (signal.aborted) return;

  // ── Fills gate (with interactive review) ───────────────────────────────────

  let fills = buildFieldFills(finalOutput, isReview, fields);
  // If the review stage produced no matchable fills (malformed LLM output), fall back to draft.
  if (isReview && fills.length === 0) {
    fills = buildFieldFills(draft, false, fields);
    isReview = false;
  }
  let replyText = workflow.taskType === 'message-reply' ? draft.reply || '' : '';

  if (!workflow.autoApply) {
    let fillsFeedbackCount = 0;
    while (true) {
      if (signal.aborted) return;
      const gate = createGate<GateResolution>();
      registry.fills = gate;

      if (workflow.taskType === 'message-reply') {
        emit({ type: 'AGENTIC_FILLS_REVIEW', kind: 'reply', replyText });
      } else {
        emit({ type: 'AGENTIC_FILLS_REVIEW', kind: 'form', fills });
      }

      let resolution: GateResolution;
      try {
        resolution = await gate.wait();
      } catch {
        return;
      } finally {
        registry.fills = null;
      }

      if (resolution.approved) break;

      fillsFeedbackCount++;
      if (fillsFeedbackCount >= MAX_GATE_ITERATIONS) {
        emit({
          type: 'AGENTIC_ERROR',
          stage: 'draft',
          error: 'Max feedback iterations reached',
        });
        return;
      }

      if (signal.aborted) return;
      emit({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'running' });
      try {
        const revisedDraft = await runDraft(ollamaConfig, workflow, fields, currentPlan, signal, {
          feedback: resolution.feedback,
          conversation,
        });
        if (workflow.taskType === 'message-reply') {
          replyText = revisedDraft.reply || '';
        } else {
          finalOutput = revisedDraft;
          isReview = false;
          fills = buildFieldFills(revisedDraft, false, fields);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emit({ type: 'AGENTIC_ERROR', stage: 'draft', error });
        return;
      }
      emit({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'done' });
    }
  }

  if (signal.aborted) return;

  // ── Apply & Summary ────────────────────────────────────────────────────────

  if (workflow.taskType === 'message-reply') {
    let insertResp: { ok: true } | { ok: false; error: string };
    try {
      insertResp = (await chrome.tabs.sendMessage(tabId, {
        type: 'INSERT_TEXT',
        text: replyText,
      })) as { ok: true } | { ok: false; error: string };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({ type: 'AGENTIC_ERROR', stage: 'draft', error });
      return;
    }
    if (!insertResp.ok) {
      emit({ type: 'AGENTIC_ERROR', stage: 'draft', error: insertResp.error });
      return;
    }
    const wordCount = replyText.split(/\s+/).filter((w) => w.length > 0).length;
    emit({
      type: 'AGENTIC_SUMMARY',
      applied: 0,
      skipped: 0,
      durationMs: Date.now() - runStart,
      wordCount,
    });
  } else {
    let applied = 0;
    try {
      const applyResp = (await chrome.tabs.sendMessage(tabId, {
        type: 'APPLY_FIELDS',
        fieldMap: fills,
      })) as { ok: true; applied: number } | { ok: false; error: string };
      applied = applyResp.ok ? applyResp.applied : 0;
    } catch {
      // Non-critical — emit summary with 0 applied
    }
    emit({
      type: 'AGENTIC_SUMMARY',
      applied,
      skipped: fills.length - applied,
      durationMs: Date.now() - runStart,
    });
  }
}
