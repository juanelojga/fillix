import { inferFieldValue, listModels } from './lib/ollama';
import {
  appendToFile,
  getFile,
  listFiles,
  listFilesInFolder,
  testConnection,
  writeFile,
} from './lib/obsidian';
import { runDraft, runPlan, runReview, runUnderstand } from './lib/pipeline';
import { resolveProvider } from './lib/providers/index';
import {
  getObsidianConfig,
  getOllamaConfig,
  getProfile,
  getProviderConfig,
  getSearchConfig,
  getWorkflows,
  getWorkflowsFolder,
  setWorkflows,
} from './lib/storage';
import { dispatchTool } from './lib/tools/registry';
import { parseWorkflow } from './lib/workflow';
import type {
  DraftOutput,
  FieldFill,
  FieldSnapshot,
  Message,
  MessageResponse,
  PipelineStage,
  PortMessage,
  ReviewOutput,
  WorkflowDefinition,
} from './types';

type AgentPortIn =
  | { type: 'AGENTIC_RUN'; workflowId: string; tabId: number }
  | { type: 'AGENTIC_APPLY'; tabId: number; fieldMap: FieldFill[] }
  | { type: 'AGENTIC_CANCEL' };

type AgentPortOut =
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

const REDACT_PATTERN =
  /\b(?:password|token|secret|key|bearer)\s*[:=]\s*\S+|\bBearer\s+\S+|(?<=\w+_(?:password|token|secret|key|bearer)\s*[:=]\s*)\S+/gi;

function redact(text: string): string {
  return text.replace(REDACT_PATTERN, '[REDACTED]');
}

function buildRunHeader(workflow: WorkflowDefinition, url: string): string {
  return `## Run — ${new Date().toISOString()}\n**Workflow:** ${workflow.name}\n**Page:** ${url}`;
}

function buildStageEntry(
  stage: PipelineStage,
  durationMs: number,
  summary: string,
  fullOutput?: string,
  logFullOutput?: boolean,
): string {
  let entry = `\n\n### Stage: ${stage} (${durationMs}ms)\n${summary}`;
  if (logFullOutput && fullOutput) {
    entry += `\n\n<details><summary>Full output</summary>\n\n\`\`\`json\n${redact(fullOutput)}\n\`\`\`\n\n</details>`;
  }
  return entry;
}

// Keys the LLM may emit as structural/meta output rather than real field IDs.
const META_KEYS = new Set([
  'field_id',
  'value',
  'revised_value',
  'change_reason',
  'analysis',
  'issues_found',
  'action',
  'task',
  'input',
  'notes',
  'context',
  'constraints',
]);

function normalizeDraft(raw: DraftOutput): DraftOutput {
  const obj = raw as Record<string, unknown>;
  // Flat single-field format: {"field_id": "actualId", "value": "text"}
  if (typeof obj['field_id'] === 'string' && typeof obj['value'] === 'string') {
    return { [obj['field_id'] as string]: obj['value'] as string };
  }
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => !META_KEYS.has(k) && typeof v === 'string'),
  ) as DraftOutput;
}

function normalizeReview(raw: ReviewOutput): ReviewOutput {
  const obj = raw as Record<string, unknown>;
  // Flat single-revision format: {"field_id": "actualId", "revised_value": "text"}
  if (typeof obj['field_id'] === 'string' && typeof obj['revised_value'] === 'string') {
    return {
      [obj['field_id'] as string]: {
        revised_value: obj['revised_value'] as string,
        change_reason: obj['change_reason'] as string | undefined,
      },
    };
  }
  const result: ReviewOutput = {};
  for (const [key, val] of Object.entries(obj)) {
    if (META_KEYS.has(key) || val === null || val === undefined) continue;
    if (typeof val === 'string') {
      result[key] = { revised_value: val };
    } else if (typeof val === 'object' && 'revised_value' in (val as object)) {
      result[key] = val as { revised_value: string; change_reason?: string };
    }
  }
  return result;
}

function buildFieldFills(
  output: DraftOutput | ReviewOutput,
  isReview: boolean,
  fields: FieldSnapshot[],
): FieldFill[] {
  const snapMap = new Map(fields.map((f) => [f.id ?? f.name ?? '', f]));
  const normalized = isReview
    ? normalizeReview(output as ReviewOutput)
    : normalizeDraft(output as DraftOutput);

  return Object.entries(normalized)
    .map(([fieldId, val]) => {
      let proposedValue: string;
      if (isReview) {
        const rv = val as { revised_value?: string } | string;
        proposedValue = typeof rv === 'string' ? rv : (rv.revised_value ?? '');
      } else {
        proposedValue = typeof val === 'string' ? val : '';
      }
      const snap = snapMap.get(fieldId);
      return {
        fieldId,
        label: snap?.label ?? fieldId,
        currentValue: snap?.currentValue ?? '',
        proposedValue,
      };
    })
    .filter(({ proposedValue }) => proposedValue.length > 0);
}

async function runAgentPipeline(
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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function autoRefreshWorkflows(): Promise<void> {
  try {
    const obsidian = await getObsidianConfig();
    if (!obsidian.apiKey) return;
    await handle({ type: 'WORKFLOWS_REFRESH' });
  } catch (err) {
    console.warn('[fillix] Auto-refresh workflows failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void autoRefreshWorkflows();
});
chrome.runtime.onStartup.addListener(() => {
  void autoRefreshWorkflows();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat') {
    let controller: AbortController | null = null;

    port.onMessage.addListener(async (msg: Message) => {
      if (msg.type === 'CHAT_START') {
        controller?.abort();
        controller = new AbortController();
        const signal = controller.signal;

        const providerConfig = await getProviderConfig();
        const searchConfig = await getSearchConfig();
        const effectiveModel = msg.model ?? providerConfig.model;
        const provider = resolveProvider({ ...providerConfig, model: effectiveModel });

        const systemPrompt = `${TOOL_SYSTEM_PROMPT}\n\n${msg.systemPrompt}`;
        const messages = [...msg.messages];
        const MAX_ITERATIONS = 8;

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          if (signal.aborted) return;

          let accumulated = '';
          let streamDone = false;

          await provider.chatStream(messages, systemPrompt, {
            signal,
            onToken: (value) => {
              accumulated += value;
              port.postMessage({ type: 'token', value } satisfies PortMessage);
            },
            onThinking: (value) =>
              port.postMessage({ type: 'thinking', value } satisfies PortMessage),
            onDone: () => {
              streamDone = true;
            },
            onError: (error) => {
              const sanitized = sanitizeError(error, providerConfig.apiKey ?? '');
              port.postMessage({ type: 'error', error: sanitized } satisfies PortMessage);
            },
          });

          if (signal.aborted) return;

          // Scan accumulated response for a tool call line
          let detectedTool: ReturnType<typeof detectToolCall> = null;
          for (const line of accumulated.split('\n')) {
            detectedTool = detectToolCall(line.trim());
            if (detectedTool) break;
          }

          if (!detectedTool) {
            // No tool call — final answer; stream already forwarded tokens
            if (streamDone) port.postMessage({ type: 'done' } satisfies PortMessage);
            return;
          }

          port.postMessage({
            type: 'tool-call',
            toolName: detectedTool.toolName,
            args: detectedTool.args,
          } satisfies PortMessage);

          const result = await dispatchTool(detectedTool.toolName, detectedTool.args, searchConfig);

          port.postMessage({
            type: 'tool-result',
            toolName: detectedTool.toolName,
            result,
          } satisfies PortMessage);

          messages.push(
            {
              role: 'assistant',
              content: `{"tool":"${detectedTool.toolName}","args":${JSON.stringify(detectedTool.args)}}`,
            },
            {
              role: 'user',
              content: `[Tool: ${detectedTool.toolName}]\nResult:\n${result}`,
            },
          );
        }

        // Max iterations reached without a final answer
        port.postMessage({ type: 'done' } satisfies PortMessage);
      } else if (msg.type === 'CHAT_STOP') {
        controller?.abort();
        port.postMessage({ type: 'done' } satisfies PortMessage);
      }
    });

    port.onDisconnect.addListener(() => controller?.abort());
  } else if (port.name === 'agent') {
    let controller: AbortController | null = null;

    port.onMessage.addListener(async (msg: AgentPortIn) => {
      try {
        if (msg.type === 'AGENTIC_RUN') {
          controller?.abort();
          controller = new AbortController();
          await runAgentPipeline(port, msg.workflowId, msg.tabId, controller.signal);
        } else if (msg.type === 'AGENTIC_APPLY') {
          const obsidianConfig = await getObsidianConfig();
          const resp = (await chrome.tabs.sendMessage(msg.tabId, {
            type: 'APPLY_FIELDS',
            fieldMap: msg.fieldMap,
          })) as { ok: true; applied: number } | { ok: false; error: string };
          const applied = resp.ok ? resp.applied : 0;
          const logPath = `fillix-logs/${new Date().toISOString().slice(0, 10)}.md`;
          appendToFile(obsidianConfig, logPath, `\n\n**Applied:** ${applied} field(s)`).catch(
            () => {},
          );
          port.postMessage({ type: 'AGENTIC_COMPLETE', applied, logPath } satisfies AgentPortOut);
        } else if (msg.type === 'AGENTIC_CANCEL') {
          controller?.abort();
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        port.postMessage({ type: 'AGENTIC_ERROR', stage: 'collect', error } satisfies AgentPortOut);
      }
    });

    port.onDisconnect.addListener(() => controller?.abort());
  }
});

export function sanitizeError(error: string, ...apiKeys: string[]): string {
  let result = error;
  for (const key of apiKeys) {
    if (key) result = result.split(key).join('[REDACTED]');
  }
  return result;
}

const TOOL_SYSTEM_PROMPT = `
## Tools Available
When you need real-time or external information, emit a tool call on its own line:
{"tool":"<name>","args":{...}}
Stop generating. A result will be appended as a user message. Then continue.
Available tools: web_search, fetch_url, news_feed, wikipedia.
Only call one tool per turn. Never fabricate tool results.
`.trim();

export function detectToolCall(
  line: string,
): { toolName: string; args: Record<string, string> } | null {
  if (!line.trimStart().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['tool'] !== 'string'
    )
      return null;
    const { tool, args } = parsed as { tool: string; args: Record<string, string> };
    return { toolName: tool, args: args ?? {} };
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg)
    .then(sendResponse)
    .catch(async (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      const { apiKey: obsidianKey } = await getObsidianConfig().catch(() => ({ apiKey: '' }));
      const { apiKey: providerKey = '' } = await getProviderConfig().catch(() => ({
        apiKey: undefined,
      }));
      sendResponse({
        ok: false,
        error: sanitizeError(raw, obsidianKey, providerKey),
      } satisfies MessageResponse);
    });
  return true;
});

async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field);
      return { ok: true, value };
    }
    case 'OLLAMA_LIST_MODELS': {
      const models = await listModels(config);
      return { ok: true, models };
    }
    case 'LIST_MODELS': {
      const providerConfig = await getProviderConfig();
      const models = await resolveProvider(providerConfig).listModels();
      return { ok: true, models };
    }
    case 'CHAT_START':
    case 'CHAT_STOP':
      return { ok: false, error: 'Use port channel for chat' };
    case 'OBSIDIAN_TEST_CONNECTION': {
      const obsidian = await getObsidianConfig();
      await testConnection(obsidian);
      return { ok: true };
    }
    case 'OBSIDIAN_LIST_FILES': {
      const obsidian = await getObsidianConfig();
      const files = await listFiles(obsidian);
      return { ok: true, files };
    }
    case 'OBSIDIAN_GET_FILE': {
      const obsidian = await getObsidianConfig();
      const content = await getFile(obsidian, msg.path);
      return { ok: true, content };
    }
    case 'OBSIDIAN_WRITE': {
      const obsidian = await getObsidianConfig();
      await writeFile(obsidian, msg.path, msg.content);
      return { ok: true };
    }
    case 'OBSIDIAN_APPEND': {
      const obsidian = await getObsidianConfig();
      await appendToFile(obsidian, msg.path, msg.content);
      return { ok: true };
    }
    case 'WORKFLOWS_REFRESH': {
      const obsidian = await getObsidianConfig();
      const folder = await getWorkflowsFolder();
      const workflowFiles = await listFilesInFolder(obsidian, folder);
      const results = await Promise.all(
        workflowFiles.map(async (path) => {
          try {
            const raw = await getFile(obsidian, path);
            return parseWorkflow(path, raw);
          } catch (err) {
            console.warn(`[fillix] Skipping workflow ${path}:`, err);
            return null;
          }
        }),
      );
      const workflows = results.filter((w) => w !== null);
      await setWorkflows(workflows);
      return { ok: true };
    }
    case 'WORKFLOWS_LIST': {
      const workflows = await getWorkflows();
      return { ok: true, workflows };
    }
    case 'DETECT_FIELDS': {
      const resp = await chrome.tabs.sendMessage(msg.tabId, { type: 'DETECT_FIELDS' });
      return resp as MessageResponse;
    }
    case 'APPLY_FIELDS': {
      const resp = await chrome.tabs.sendMessage(msg.tabId, {
        type: 'APPLY_FIELDS',
        fieldMap: msg.fieldMap,
      });
      return resp as MessageResponse;
    }
    default: {
      const _: never = msg;
      return _;
    }
  }
}
