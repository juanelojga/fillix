import { writable } from 'svelte/store';
import type { AgentThreadMessage, MessageResponse, WorkflowDefinition } from '../../types';
import type { AgentPortIn, AgentPortOut } from '../../lib/agent-runner';

export const workflowList = writable<WorkflowDefinition[]>([]);
export const isAgentRunning = writable(false);
export const agentMessages = writable<AgentThreadMessage[]>([]);
export const pendingGate = writable<'plan' | 'fills' | null>(null);

export function addMessage(msg: AgentThreadMessage): void {
  agentMessages.update((msgs) => [...msgs, msg]);
}

export function setPendingGate(gate: 'plan' | 'fills' | null): void {
  pendingGate.set(gate);
}

export function clearThread(): void {
  agentMessages.set([]);
  pendingGate.set(null);
}

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
  clearThread();
  isAgentRunning.set(true);
  const msg: AgentPortIn = { type: 'AGENTIC_RUN', workflowId, tabId };
  port.postMessage(msg);
}

export function handleStageUpdate(_msg: Extract<AgentPortOut, { type: 'AGENTIC_STAGE' }>): void {
  // Stage signals are handled directly in WorkflowTab for loading indicators
}

export function cancelRun(port: chrome.runtime.Port): void {
  const msg: AgentPortIn = { type: 'AGENTIC_CANCEL' };
  port.postMessage(msg);
  clearThread();
  isAgentRunning.set(false);
}
