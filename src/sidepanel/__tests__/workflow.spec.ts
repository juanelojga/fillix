// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { WorkflowDefinition } from '../../types';

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('initWorkflowPanel — port name (Task 1.4)', () => {
  beforeEach(setupMocks);

  it('opens a port named "workflow" (not "agent") when run button is clicked', async () => {
    // Dynamically import after mocks are set up so chrome stub is in scope
    const { initWorkflowPanel } = await import('../workflow');
    await initWorkflowPanel();
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    select.value = stubWorkflow.id;
    select.dispatchEvent(new Event('change'));
    (document.getElementById('agent-run-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'workflow' });
  });
});

describe('initWorkflowPanel — workflow list', () => {
  beforeEach(setupMocks);

  it('sends WORKFLOWS_LIST on init and populates the select', async () => {
    const { initWorkflowPanel } = await import('../workflow');
    await initWorkflowPanel();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'WORKFLOWS_LIST' });
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
  });

  it('enables run button when a workflow is selected', async () => {
    const { initWorkflowPanel } = await import('../workflow');
    await initWorkflowPanel();
    const select = document.getElementById('workflow-select') as HTMLSelectElement;
    const runBtn = document.getElementById('agent-run-btn') as HTMLButtonElement;
    select.value = stubWorkflow.id;
    select.dispatchEvent(new Event('change'));
    expect(runBtn.disabled).toBe(false);
  });
});
