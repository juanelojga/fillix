import { writable } from 'svelte/store';
import type { FieldFill, PipelineStage, WorkflowDefinition } from '../../types';
import type { AgentPortIn, AgentPortOut } from '../../lib/agent-runner';
import type { MessageResponse } from '../../types';

export type StageStatus = 'idle' | 'running' | 'done' | 'error';

export interface PipelineStageState {
  stage: PipelineStage;
  status: StageStatus;
  durationMs?: number;
  summary?: string;
  error?: string;
}

const ALL_STAGES: PipelineStage[] = ['collect', 'understand', 'plan', 'draft', 'review'];

function idleStages(): PipelineStageState[] {
  return ALL_STAGES.map((stage) => ({ stage, status: 'idle' as StageStatus }));
}

export const workflowList = writable<WorkflowDefinition[]>([]);
export const pipelineStages = writable<PipelineStageState[]>(idleStages());
export const confirmFields = writable<FieldFill[]>([]);
export const isAgentRunning = writable(false);

export async function loadWorkflows(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'WORKFLOWS_LIST',
    })) as MessageResponse | undefined;
    if (response?.ok && 'workflows' in response) {
      workflowList.set(response.workflows);
    }
  } catch {
    // service worker unavailable — workflow list stays as-is
  }
}

export function startRun(workflowId: string, tabId: number, port: chrome.runtime.Port): void {
  pipelineStages.set(idleStages());
  confirmFields.set([]);
  isAgentRunning.set(true);
  const msg: AgentPortIn = { type: 'AGENTIC_RUN', workflowId, tabId };
  port.postMessage(msg);
}

export function handleStageUpdate(msg: Extract<AgentPortOut, { type: 'AGENTIC_STAGE' }>): void {
  pipelineStages.update((stages) =>
    stages.map((s) =>
      s.stage === msg.stage
        ? {
            ...s,
            status: msg.status,
            ...(msg.summary !== undefined ? { summary: msg.summary } : {}),
            ...(msg.durationMs !== undefined ? { durationMs: msg.durationMs } : {}),
          }
        : s,
    ),
  );
}

export function handleConfirm(msg: Extract<AgentPortOut, { type: 'AGENTIC_CONFIRM' }>): void {
  confirmFields.set(msg.proposed);
}

export function applyFields(
  editedFills: FieldFill[],
  tabId: number,
  port: chrome.runtime.Port,
): void {
  const msg: AgentPortIn = { type: 'AGENTIC_APPLY', tabId, fieldMap: editedFills };
  port.postMessage(msg);
  confirmFields.set([]);
}

export function cancelRun(port: chrome.runtime.Port): void {
  const msg: AgentPortIn = { type: 'AGENTIC_CANCEL' };
  port.postMessage(msg);
  confirmFields.set([]);
  pipelineStages.set(idleStages());
  isAgentRunning.set(false);
}
