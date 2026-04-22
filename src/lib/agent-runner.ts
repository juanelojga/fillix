import { appendToFile } from './obsidian';
import { runDraft, runPlan, runReview, runUnderstand } from './pipeline';
import { getObsidianConfig, getOllamaConfig, getProfile, getWorkflows } from './storage';
import { buildRunHeader, buildStageEntry } from './agent-log';
import { buildFieldFills } from './field-normalizer';
import type { DraftOutput, FieldFill, FieldSnapshot, PipelineStage, ReviewOutput } from '../types';

export type AgentPortIn =
  | { type: 'AGENTIC_RUN'; workflowId: string; tabId: number }
  | { type: 'AGENTIC_APPLY'; tabId: number; fieldMap: FieldFill[] }
  | { type: 'AGENTIC_CANCEL' };

export type AgentPortOut =
  | {
      type: 'AGENTIC_STAGE';
      stage: PipelineStage;
      status: 'running' | 'done' | 'error';
      summary?: string;
      durationMs?: number;
    }
  | { type: 'AGENTIC_CONFIRM'; proposed: FieldFill[]; logEntryId: string }
  | { type: 'AGENTIC_COMPLETE'; applied: number; logPath: string }
  | { type: 'AGENTIC_ERROR'; stage: PipelineStage; error: string };

export async function runAgentPipeline(
  port: chrome.runtime.Port,
  workflowId: string,
  tabId: number,
  signal: AbortSignal,
): Promise<void> {
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

  emit({ type: 'AGENTIC_STAGE', stage: 'collect', status: 'running' });
  let fields: FieldSnapshot[];
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
  const understandSummary = `Task: ${understand.task_type}, ${understand.detected_fields.length} fields, confidence ${understand.confidence.toFixed(2)}`;
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

  emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'running' });
  const planStart = Date.now();
  let plan: Awaited<ReturnType<typeof runPlan>>;
  try {
    plan = await runPlan(ollamaConfig, workflow, fields, understand, profile, signal);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'AGENTIC_ERROR', stage: 'plan', error });
    emit({ type: 'AGENTIC_STAGE', stage: 'plan', status: 'error' });
    return;
  }
  const planMs = Date.now() - planStart;
  const planSummary = `${plan.fields_to_fill.length} fields to fill, ${plan.missing_fields.length} missing`;
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
    buildStageEntry('plan', planMs, planSummary, JSON.stringify(plan), workflow.logFullOutput),
  ).catch(() => {});

  if (signal.aborted) return;

  emit({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'running' });
  const draftStart = Date.now();
  let draft: DraftOutput;
  try {
    draft = await runDraft(ollamaConfig, workflow, fields, plan, signal);
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

  let finalOutput: DraftOutput | ReviewOutput = draft;
  let isReview = false;
  if (workflow.review) {
    emit({ type: 'AGENTIC_STAGE', stage: 'review', status: 'running' });
    const reviewStart = Date.now();
    try {
      finalOutput = await runReview(ollamaConfig, workflow, draft, plan, signal);
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

  const proposed = buildFieldFills(finalOutput, isReview, fields);
  const logEntryId = new Date().toISOString();
  emit({ type: 'AGENTIC_CONFIRM', proposed, logEntryId });
}
