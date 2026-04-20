// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { initAgentPanel } from '../agent';
import type { FieldFill, WorkflowDefinition } from '../../types';

// ── Chrome API mocks ──────────────────────────────────────────────────────────

const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

const mockSendMessage = vi.fn();
const mockTabsQuery = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    connect: vi.fn(() => mockPort),
    sendMessage: mockSendMessage,
    id: 'test-extension-id',
  },
  tabs: {
    query: mockTabsQuery,
  },
});

// ── DOM fixture ───────────────────────────────────────────────────────────────

function buildDOM(): void {
  document.body.innerHTML = `
    <div id="agent-view">
      <div id="agent-selector">
        <select id="workflow-select">
          <option value="">— select workflow —</option>
        </select>
        <button id="workflow-refresh-btn">↺</button>
        <button id="agent-run-btn" disabled>Run</button>
      </div>
      <ol id="pipeline-stages" hidden>
        <li class="stage-item" data-stage="collect">Collect</li>
        <li class="stage-item" data-stage="understand">Understand</li>
        <li class="stage-item" data-stage="plan">Plan</li>
        <li class="stage-item" data-stage="draft">Draft</li>
        <li class="stage-item" data-stage="review">Review</li>
      </ol>
      <div id="agent-confirm" hidden>
        <table id="confirm-table">
          <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody id="confirm-tbody"></tbody>
        </table>
        <div id="agent-confirm-actions">
          <button id="agent-apply-btn">Apply</button>
          <button id="agent-cancel-btn">Cancel</button>
        </div>
      </div>
      <p id="agent-complete" hidden></p>
      <p id="agent-log-warning" hidden></p>
    </div>
  `;
}

const stubWorkflow: WorkflowDefinition = {
  id: 'fillix-workflows/test.md',
  name: 'Test Workflow',
  taskType: 'form',
  tone: 'professional',
  requiredProfileFields: [],
  review: true,
  logFullOutput: false,
  autoApply: false,
  systemPrompt: 'Fill the form.',
};

const stubFills: FieldFill[] = [
  { fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'test@example.com' },
  { fieldId: 'name', label: 'Full name', currentValue: 'Old', proposedValue: 'New Name' },
];

// ── Shared beforeEach setup ───────────────────────────────────────────────────

function setupMocks(): void {
  vi.resetAllMocks();
  buildDOM();
  mockSendMessage.mockResolvedValue({ ok: true, workflows: [stubWorkflow] });
  mockTabsQuery.mockResolvedValue([{ id: 42 }]);
  (chrome.runtime.connect as Mock).mockReturnValue(mockPort);
  mockPort.postMessage = vi.fn();
  mockPort.onMessage.addListener = vi.fn();
  mockPort.onDisconnect.addListener = vi.fn();
  mockPort.disconnect = vi.fn();
}

// ── Helper to extract the port onMessage listener ─────────────────────────────

function getPortMessageListener(): (msg: unknown) => void {
  return (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (msg: unknown) => void;
}

// ── Helper to start a run ─────────────────────────────────────────────────────

async function startRun(): Promise<void> {
  await initAgentPanel();
  const select = document.getElementById('workflow-select') as HTMLSelectElement;
  select.value = stubWorkflow.id;
  select.dispatchEvent(new Event('change'));
  (document.getElementById('agent-run-btn') as HTMLButtonElement).click();
  await Promise.resolve();
  await Promise.resolve();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('initAgentPanel — workflow list', () => {
  beforeEach(setupMocks);

  it('sends WORKFLOWS_LIST on init and populates the select with returned workflows', async () => {
    await initAgentPanel();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'WORKFLOWS_LIST' });
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[1].value).toBe(stubWorkflow.id);
    expect(select.options[1].text).toBe(stubWorkflow.name);
  });

  it('keeps #agent-run-btn disabled when no workflow is selected', async () => {
    await initAgentPanel();
    const runBtn = document.getElementById('agent-run-btn') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });

  it('enables #agent-run-btn when a workflow is selected', async () => {
    await initAgentPanel();
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    const runBtn = document.getElementById('agent-run-btn') as HTMLButtonElement;
    select.value = stubWorkflow.id;
    select.dispatchEvent(new Event('change'));
    expect(runBtn.disabled).toBe(false);
  });

  it('disables #agent-run-btn again when selection is cleared', async () => {
    await initAgentPanel();
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    const runBtn = document.getElementById('agent-run-btn') as HTMLButtonElement;
    select.value = stubWorkflow.id;
    select.dispatchEvent(new Event('change'));
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(runBtn.disabled).toBe(true);
  });
});

describe('initAgentPanel — refresh button', () => {
  beforeEach(setupMocks);

  it('sends WORKFLOWS_REFRESH then re-populates dropdown when refresh button is clicked', async () => {
    mockSendMessage
      .mockResolvedValueOnce({ ok: true, workflows: [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, workflows: [stubWorkflow] });
    await initAgentPanel();
    (document.getElementById('workflow-refresh-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const types = (mockSendMessage as Mock).mock.calls.map((c: [{ type: string }]) => c[0].type);
    expect(types).toContain('WORKFLOWS_REFRESH');
  });

  it('repopulates dropdown after refresh', async () => {
    mockSendMessage
      .mockResolvedValueOnce({ ok: true, workflows: [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, workflows: [stubWorkflow] });
    await initAgentPanel();
    (document.getElementById('workflow-refresh-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
  });
});

describe('initAgentPanel — run button', () => {
  beforeEach(setupMocks);

  it('opens a port named "agent" when run button is clicked', async () => {
    await startRun();
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'agent' });
  });

  it('sends AGENTIC_RUN with workflowId and tabId over the port', async () => {
    await startRun();
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'AGENTIC_RUN',
      workflowId: stubWorkflow.id,
      tabId: 42,
    });
  });

  it('shows #pipeline-stages and disables run button after clicking run', async () => {
    await startRun();
    expect((document.getElementById('pipeline-stages') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('agent-run-btn') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('port message — AGENTIC_STAGE', () => {
  beforeEach(async () => {
    setupMocks();
    await startRun();
  });

  it('marks the matching <li> with data-status="running"', () => {
    getPortMessageListener()({ type: 'AGENTIC_STAGE', stage: 'understand', status: 'running' });
    const li = document.querySelector('[data-stage="understand"]') as HTMLElement;
    expect(li.dataset.status).toBe('running');
  });

  it('marks the matching <li> with data-status="done" and appends duration', () => {
    getPortMessageListener()({
      type: 'AGENTIC_STAGE',
      stage: 'plan',
      status: 'done',
      summary: 'Planned 3 fields',
      durationMs: 1200,
    });
    const li = document.querySelector('[data-stage="plan"]') as HTMLElement;
    expect(li.dataset.status).toBe('done');
    expect(li.textContent).toContain('1200');
  });

  it('marks the matching <li> with data-status="error"', () => {
    getPortMessageListener()({ type: 'AGENTIC_STAGE', stage: 'draft', status: 'error' });
    const li = document.querySelector('[data-stage="draft"]') as HTMLElement;
    expect(li.dataset.status).toBe('error');
  });
});

describe('port message — AGENTIC_CONFIRM', () => {
  beforeEach(async () => {
    setupMocks();
    await startRun();
  });

  it('shows #agent-confirm', () => {
    getPortMessageListener()({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
    expect((document.getElementById('agent-confirm') as HTMLElement).hidden).toBe(false);
  });

  it('populates #confirm-tbody with one row per FieldFill', () => {
    getPortMessageListener()({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
    expect(document.querySelectorAll('#confirm-tbody tr').length).toBe(stubFills.length);
  });

  it('pre-fills editable inputs with proposedValue', () => {
    getPortMessageListener()({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
    const inputs = document.querySelectorAll<HTMLInputElement>('#confirm-tbody input');
    expect(inputs[0].value).toBe('test@example.com');
    expect(inputs[1].value).toBe('New Name');
  });

  it('shows currentValue in the row', () => {
    getPortMessageListener()({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
    expect((document.getElementById('confirm-tbody') as HTMLElement).textContent).toContain('Old');
  });
});

describe('port message — AGENTIC_COMPLETE', () => {
  beforeEach(async () => {
    setupMocks();
    await startRun();
  });

  it('shows #agent-complete with applied count', () => {
    getPortMessageListener()({
      type: 'AGENTIC_COMPLETE',
      applied: 3,
      logPath: 'fillix-logs/2026-04-20.md',
    });
    const complete = document.getElementById('agent-complete') as HTMLElement;
    expect(complete.hidden).toBe(false);
    expect(complete.textContent).toContain('3');
  });

  it('hides #agent-confirm after AGENTIC_COMPLETE', () => {
    const listener = getPortMessageListener();
    listener({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
    listener({ type: 'AGENTIC_COMPLETE', applied: 2, logPath: 'fillix-logs/2026-04-20.md' });
    expect((document.getElementById('agent-confirm') as HTMLElement).hidden).toBe(true);
  });
});

describe('#agent-apply-btn click', () => {
  beforeEach(async () => {
    setupMocks();
    await startRun();
    getPortMessageListener()({ type: 'AGENTIC_CONFIRM', proposed: stubFills, logEntryId: 'log-1' });
  });

  it('sends AGENTIC_APPLY with tabId and fieldMap over the port', () => {
    (document.getElementById('agent-apply-btn') as HTMLButtonElement).click();
    expect(mockPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_APPLY', tabId: 42 }),
    );
  });

  it('uses the edited input value as editedValue when it differs from proposedValue', () => {
    const inputs = document.querySelectorAll<HTMLInputElement>('#confirm-tbody input');
    inputs[0].value = 'edited@example.com';
    (document.getElementById('agent-apply-btn') as HTMLButtonElement).click();
    const call = (mockPort.postMessage as Mock).mock.calls.find(
      (c: [{ type: string }]) => c[0].type === 'AGENTIC_APPLY',
    ) as [{ fieldMap: FieldFill[] }];
    expect(call[0].fieldMap[0].editedValue).toBe('edited@example.com');
  });

  it('omits editedValue when the input is unchanged from proposedValue', () => {
    (document.getElementById('agent-apply-btn') as HTMLButtonElement).click();
    const call = (mockPort.postMessage as Mock).mock.calls.find(
      (c: [{ type: string }]) => c[0].type === 'AGENTIC_APPLY',
    ) as [{ fieldMap: FieldFill[] }];
    expect(call[0].fieldMap[0].editedValue).toBeUndefined();
  });
});

describe('#agent-cancel-btn click', () => {
  beforeEach(async () => {
    setupMocks();
    await startRun();
  });

  it('sends AGENTIC_CANCEL via port', () => {
    (document.getElementById('agent-cancel-btn') as HTMLButtonElement).click();
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'AGENTIC_CANCEL' });
  });

  it('calls port.disconnect() on cancel', () => {
    (document.getElementById('agent-cancel-btn') as HTMLButtonElement).click();
    expect(mockPort.disconnect).toHaveBeenCalled();
  });

  it('resets UI to selector state: hides stages and confirm, re-enables run', () => {
    (document.getElementById('agent-cancel-btn') as HTMLButtonElement).click();
    expect((document.getElementById('pipeline-stages') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('agent-confirm') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('agent-run-btn') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('port disconnect on complete', () => {
  it('calls port.disconnect() after AGENTIC_COMPLETE is received', async () => {
    setupMocks();
    await startRun();
    getPortMessageListener()({
      type: 'AGENTIC_COMPLETE',
      applied: 1,
      logPath: 'fillix-logs/2026-04-20.md',
    });
    expect(mockPort.disconnect).toHaveBeenCalled();
  });
});
