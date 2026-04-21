import type { FieldFill, Message, MessageResponse, PipelineStage } from '../types';

type AgentMsg =
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

export async function initAgentPanel(): Promise<void> {
  const select = document.getElementById('workflow-select') as HTMLSelectElement;
  const refreshBtn = document.getElementById('workflow-refresh-btn') as HTMLButtonElement;
  const runBtn = document.getElementById('agent-run-btn') as HTMLButtonElement;
  const stagesList = document.getElementById('pipeline-stages') as HTMLElement;
  const confirmDiv = document.getElementById('agent-confirm') as HTMLElement;
  const cancelBtn = document.getElementById('agent-cancel-btn') as HTMLButtonElement;
  const applyBtn = document.getElementById('agent-apply-btn') as HTMLButtonElement;
  const confirmTbody = document.getElementById('confirm-tbody') as HTMLElement;
  const completeEl = document.getElementById('agent-complete') as HTMLElement;

  let activePort: chrome.runtime.Port | null = null;
  let activeTabId: number | undefined;
  const pendingFills: FieldFill[] = [];

  await populateWorkflows(select);

  select.addEventListener('change', () => {
    runBtn.disabled = !select.value;
  });

  refreshBtn.addEventListener('click', () => {
    void (async () => {
      resetToSelector();
      await chrome.runtime.sendMessage({ type: 'WORKFLOWS_REFRESH' } satisfies Message);
      await populateWorkflows(select);
    })();
  });

  runBtn.addEventListener('click', () => {
    void (async () => {
      const workflowId = select.value;
      if (!workflowId) return;

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tabs[0]?.id;
      if (activeTabId === undefined) return;

      activePort = chrome.runtime.connect({ name: 'agent' });
      stagesList.hidden = false;
      runBtn.disabled = true;

      activePort.onMessage.addListener(handlePortMessage);
      activePort.onDisconnect.addListener(() => {
        activePort = null;
      });
      activePort.postMessage({ type: 'AGENTIC_RUN', workflowId, tabId: activeTabId });
    })();
  });

  cancelBtn.addEventListener('click', () => {
    activePort?.postMessage({ type: 'AGENTIC_CANCEL' });
    activePort?.disconnect();
    activePort = null;
    resetToSelector();
  });

  applyBtn.addEventListener('click', () => {
    if (!activePort || activeTabId === undefined) return;
    const inputs = confirmTbody.querySelectorAll<HTMLInputElement>('input');
    const fieldMap: FieldFill[] = pendingFills.map((fill, i) => {
      const input = inputs[i];
      const edited = input?.value;
      return edited !== undefined && edited !== fill.proposedValue
        ? { ...fill, editedValue: edited }
        : fill;
    });
    activePort.postMessage({ type: 'AGENTIC_APPLY', tabId: activeTabId, fieldMap });
  });

  function handlePortMessage(msg: AgentMsg): void {
    switch (msg.type) {
      case 'AGENTIC_STAGE':
        updateStageItem(msg.stage, msg.status, msg.durationMs);
        break;
      case 'AGENTIC_CONFIRM':
        pendingFills.length = 0;
        pendingFills.push(...msg.proposed);
        confirmTbody.innerHTML = '';
        for (const fill of msg.proposed) {
          const tr = document.createElement('tr');
          const tdLabel = document.createElement('td');
          tdLabel.textContent = fill.label;
          const tdCurrent = document.createElement('td');
          tdCurrent.textContent = fill.currentValue;
          const tdProposed = document.createElement('td');
          const input = document.createElement('input');
          input.type = 'text';
          input.value = fill.proposedValue;
          input.dataset.fieldId = fill.fieldId;
          input.dataset.original = fill.proposedValue;
          tdProposed.appendChild(input);
          tr.appendChild(tdLabel);
          tr.appendChild(tdCurrent);
          tr.appendChild(tdProposed);
          confirmTbody.appendChild(tr);
        }
        confirmDiv.hidden = false;
        break;
      case 'AGENTIC_COMPLETE':
        showComplete(msg.applied);
        activePort?.disconnect();
        activePort = null;
        break;
      case 'AGENTIC_ERROR':
        updateStageItem(msg.stage, 'error', undefined, msg.error);
        activePort?.disconnect();
        activePort = null;
        runBtn.disabled = !select.value;
        break;
      default: {
        const _exhaustive: never = msg;
        throw new Error(`Unhandled agent message: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  function updateStageItem(
    stage: PipelineStage,
    status: 'running' | 'done' | 'error',
    durationMs?: number,
    errorText?: string,
  ): void {
    const li = stagesList.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    if (!li) return;
    li.dataset.status = status;
    if (status === 'done' && durationMs !== undefined) {
      const existing = li.querySelector('.stage-duration');
      const span = existing ?? document.createElement('span');
      span.className = 'stage-duration';
      span.textContent = ` (${durationMs}ms)`;
      if (!existing) li.appendChild(span);
    }
    if (status === 'error' && errorText) {
      const existing = li.querySelector('.stage-error');
      const small = existing ?? document.createElement('small');
      small.className = 'stage-error';
      small.textContent = ` — ${errorText}`;
      if (!existing) li.appendChild(small);
    }
  }

  function showComplete(applied: number): void {
    confirmDiv.hidden = true;
    completeEl.textContent = `Completed: ${applied} field${applied !== 1 ? 's' : ''} applied`;
    completeEl.hidden = false;
  }

  function resetToSelector(): void {
    stagesList.hidden = true;
    confirmDiv.hidden = true;
    completeEl.hidden = true;
    for (const li of stagesList.querySelectorAll<HTMLElement>('.stage-item')) {
      delete li.dataset.status;
      li.querySelector('.stage-duration')?.remove();
    }
    runBtn.disabled = !select.value;
  }
}

async function populateWorkflows(select: HTMLSelectElement): Promise<void> {
  const res = (await chrome.runtime.sendMessage({
    type: 'WORKFLOWS_LIST',
  } satisfies Message)) as MessageResponse;

  const defaultOpt = select.options[0];
  select.innerHTML = '';
  if (defaultOpt) select.appendChild(defaultOpt);

  if (res.ok && 'workflows' in res) {
    for (const wf of res.workflows) {
      const opt = document.createElement('option');
      opt.value = wf.id;
      opt.textContent = wf.name;
      select.appendChild(opt);
    }
  }
}
