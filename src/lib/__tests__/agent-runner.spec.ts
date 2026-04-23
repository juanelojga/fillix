// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGate, runAgentPipeline } from '../agent-runner';
import type { GateRegistry } from '../agent-runner';
import type { FieldFill, FieldSnapshot, PlanOutput, UnderstandOutput } from '../../types';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockRunUnderstand = vi.hoisted(() => vi.fn());
const mockRunPlan = vi.hoisted(() => vi.fn());
const mockRunDraft = vi.hoisted(() => vi.fn());
const mockRunReview = vi.hoisted(() => vi.fn());
const mockBuildFieldFills = vi.hoisted(() => vi.fn());
const mockGetWorkflows = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockTabsGet = vi.hoisted(() => vi.fn());

vi.mock('../pipeline', () => ({
  runUnderstand: mockRunUnderstand,
  runPlan: mockRunPlan,
  runDraft: mockRunDraft,
  runReview: mockRunReview,
  stripThinking: vi.fn((s: string) => s),
}));

vi.mock('../storage', () => ({
  getOllamaConfig: vi
    .fn()
    .mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
  getObsidianConfig: vi.fn().mockResolvedValue({ baseUrl: '', apiKey: '' }),
  getProfile: vi.fn().mockResolvedValue('Name: Test User'),
  getWorkflows: mockGetWorkflows,
  getOllamaConfigOrProvider: vi
    .fn()
    .mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
}));

vi.mock('../obsidian', () => ({ appendToFile: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../agent-log', () => ({
  buildRunHeader: vi.fn(() => ''),
  buildStageEntry: vi.fn(() => ''),
}));

vi.mock('../field-normalizer', () => ({ buildFieldFills: mockBuildFieldFills }));

vi.stubGlobal('chrome', {
  tabs: { sendMessage: mockSendMessage, get: mockTabsGet },
  scripting: { executeScript: vi.fn() },
  runtime: { getManifest: vi.fn(() => ({ content_scripts: [] })) },
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIELDS: FieldSnapshot[] = [{ id: 'email', label: 'Email', type: 'email', currentValue: '' }];

const UNDERSTAND: UnderstandOutput = {
  task_type: 'form',
  detected_fields: ['email'],
  confidence: 0.95,
};

const PLAN: PlanOutput = {
  fields_to_fill: [{ field_id: 'email', strategy: 'use profile.email' }],
  missing_fields: [],
  tone: 'professional',
  notes: '',
};

const FILLS: FieldFill[] = [
  { fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'test@example.com' },
];

const WORKFLOW_FORM = {
  id: 'workflows/test.md',
  name: 'Test',
  taskType: 'form' as const,
  tone: 'professional',
  requiredProfileFields: [],
  review: false,
  logFullOutput: false,
  autoApply: false,
  systemPrompt: 'Test prompt',
};

const WORKFLOW_AUTO_APPLY = { ...WORKFLOW_FORM, autoApply: true };

// ── Helpers ───────────────────────────────────────────────────────────────────

type AgentMsg = Record<string, unknown>;

function makeMockPort() {
  const disconnectListeners: (() => void)[] = [];
  return {
    postMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: {
      addListener: vi.fn((cb: () => void) => disconnectListeners.push(cb)),
      fire: () => disconnectListeners.forEach((cb) => cb()),
    },
  };
}

function requireGate<T>(gate: T | null, name: string): T {
  if (!gate) throw new Error(`${name} gate was not set by the pipeline`);
  return gate;
}

function setupDefaultStubs(workflow = WORKFLOW_FORM) {
  mockGetWorkflows.mockResolvedValue([workflow]);
  mockRunUnderstand.mockResolvedValue(UNDERSTAND);
  mockRunPlan.mockResolvedValue(PLAN);
  mockRunDraft.mockResolvedValue({ email: 'test@example.com' });
  mockBuildFieldFills.mockReturnValue(FILLS);
  mockSendMessage
    .mockResolvedValueOnce({ ok: true, fields: FIELDS }) // DETECT_FIELDS
    .mockResolvedValueOnce({ ok: true, applied: 1 }); // APPLY_FIELDS
  mockTabsGet.mockResolvedValue({ url: 'https://example.com/apply' });
}

// ── createGate ────────────────────────────────────────────────────────────────

describe('createGate', () => {
  it('resolves the wait promise when resolve is called', async () => {
    const gate = createGate<string>();
    gate.resolve('hello');
    await expect(gate.wait()).resolves.toBe('hello');
  });

  it('rejects the wait promise when reject is called', async () => {
    const gate = createGate<string>();
    gate.reject(new Error('port disconnected'));
    await expect(gate.wait()).rejects.toThrow('port disconnected');
  });

  it('is idempotent: second resolve/reject after settle is ignored', async () => {
    const gate = createGate<number>();
    gate.resolve(1);
    gate.resolve(2);
    gate.reject(new Error('ignored'));
    await expect(gate.wait()).resolves.toBe(1);
  });
});

// ── runAgentPipeline — gate flow ──────────────────────────────────────────────

describe('runAgentPipeline — plan and fills gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultStubs();
  });

  it('emits AGENTIC_PLAN_REVIEW and sets registry.plan after plan stage', async () => {
    const port = makeMockPort();
    const registry: GateRegistry = { plan: null, fills: null };

    const pipelinePromise = runAgentPipeline(
      port,
      WORKFLOW_FORM.id,
      42,
      new AbortController().signal,
      registry,
    );

    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AGENTIC_PLAN_REVIEW' }),
      ),
    );
    expect(registry.plan).not.toBeNull();

    // Unblock to let pipeline finish
    requireGate(registry.plan, 'plan').resolve({ approved: true });
    await vi.waitFor(() => expect(registry.fills).not.toBeNull());
    requireGate(registry.fills, 'fills').resolve({ approved: true });
    await pipelinePromise;
  });

  it('emits AGENTIC_FILLS_REVIEW and sets registry.fills after draft stage', async () => {
    const port = makeMockPort();
    const registry: GateRegistry = { plan: null, fills: null };

    const pipelinePromise = runAgentPipeline(
      port,
      WORKFLOW_FORM.id,
      42,
      new AbortController().signal,
      registry,
    );

    await vi.waitFor(() => expect(registry.plan).not.toBeNull());
    requireGate(registry.plan, 'plan').resolve({ approved: true });

    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AGENTIC_FILLS_REVIEW' }),
      ),
    );
    expect(registry.fills).not.toBeNull();

    requireGate(registry.fills, 'fills').resolve({ approved: true });
    await pipelinePromise;
  });

  it('emits AGENTIC_SUMMARY after both gates approve and never emits AGENTIC_CONFIRM', async () => {
    const port = makeMockPort();
    const registry: GateRegistry = { plan: null, fills: null };

    const pipelinePromise = runAgentPipeline(
      port,
      WORKFLOW_FORM.id,
      42,
      new AbortController().signal,
      registry,
    );

    await vi.waitFor(() => expect(registry.plan).not.toBeNull());
    requireGate(registry.plan, 'plan').resolve({ approved: true });
    await vi.waitFor(() => expect(registry.fills).not.toBeNull());
    requireGate(registry.fills, 'fills').resolve({ approved: true });

    await pipelinePromise;

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_SUMMARY', applied: 1 }),
    );
    expect(port.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_CONFIRM' }),
    );
  });

  it('re-runs runPlan with feedback and creates a new gate', async () => {
    const port = makeMockPort();
    const registry: GateRegistry = { plan: null, fills: null };

    const pipelinePromise = runAgentPipeline(
      port,
      WORKFLOW_FORM.id,
      42,
      new AbortController().signal,
      registry,
    );

    // First plan round — send feedback
    await vi.waitFor(() => expect(registry.plan).not.toBeNull());
    const firstGate = requireGate(registry.plan, 'plan');
    registry.plan = null;
    firstGate.resolve({ approved: false, feedback: 'focus on the email field' });

    // Second plan round — approve
    await vi.waitFor(() => expect(registry.plan).not.toBeNull());
    expect(mockRunPlan).toHaveBeenCalledTimes(2);
    expect(mockRunPlan.mock.calls[1]?.[6]).toMatchObject({ feedback: 'focus on the email field' });

    requireGate(registry.plan, 'plan').resolve({ approved: true });
    await vi.waitFor(() => expect(registry.fills).not.toBeNull());
    requireGate(registry.fills, 'fills').resolve({ approved: true });
    await pipelinePromise;
  });

  it('emits AGENTIC_ERROR when plan feedback limit is reached', async () => {
    const port = makeMockPort();
    const registry: GateRegistry = { plan: null, fills: null };

    const pipelinePromise = runAgentPipeline(
      port,
      WORKFLOW_FORM.id,
      42,
      new AbortController().signal,
      registry,
    );

    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(registry.plan).not.toBeNull());
      const gate = requireGate(registry.plan, 'plan');
      registry.plan = null;
      gate.resolve({ approved: false, feedback: `round ${i}` });
    }

    await pipelinePromise;

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_ERROR', stage: 'plan' }),
    );
    expect(port.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_SUMMARY' }),
    );
  });
});

// ── runAgentPipeline — autoApply ──────────────────────────────────────────────

describe('runAgentPipeline — autoApply: true', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultStubs(WORKFLOW_AUTO_APPLY);
  });

  it('does not emit AGENTIC_PLAN_REVIEW or AGENTIC_FILLS_REVIEW', async () => {
    const port = makeMockPort();

    await runAgentPipeline(port, WORKFLOW_AUTO_APPLY.id, 42, new AbortController().signal, {
      plan: null,
      fills: null,
    });

    const types = port.postMessage.mock.calls.map((c) => (c[0] as AgentMsg).type);
    expect(types).not.toContain('AGENTIC_PLAN_REVIEW');
    expect(types).not.toContain('AGENTIC_FILLS_REVIEW');
  });

  it('emits AGENTIC_SUMMARY without waiting for any gate', async () => {
    const port = makeMockPort();

    await runAgentPipeline(port, WORKFLOW_AUTO_APPLY.id, 42, new AbortController().signal, {
      plan: null,
      fills: null,
    });

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AGENTIC_SUMMARY' }),
    );
  });
});

// ── Source integrity check ────────────────────────────────────────────────────

describe('agent-runner.ts — source integrity', () => {
  const src = () => readFileSync(resolve(process.cwd(), 'src/lib/agent-runner.ts'), 'utf-8');

  it('does not emit AGENTIC_CONFIRM anywhere', () => {
    expect(src()).not.toContain("'AGENTIC_CONFIRM'");
    expect(src()).not.toContain('"AGENTIC_CONFIRM"');
  });

  it('emits AGENTIC_SUMMARY', () => {
    expect(src()).toContain('AGENTIC_SUMMARY');
  });

  it('exports createGate', () => {
    expect(src()).toContain('export function createGate');
  });
});
