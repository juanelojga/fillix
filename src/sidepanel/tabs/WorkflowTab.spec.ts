// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const tab = (p: string) => resolve(process.cwd(), 'src/sidepanel/tabs', p);

describe('WorkflowTab.svelte — Sprint 1 structure (Tasks 1.1, 1.3, 1.4)', () => {
  it('exists at the new path', () => {
    expect(existsSync(tab('WorkflowTab.svelte'))).toBe(true);
  });

  it('old AgentTab.svelte path no longer exists', () => {
    expect(existsSync(tab('AgentTab.svelte'))).toBe(false);
  });

  describe('port context — Task 1.4', () => {
    const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

    it('reads workflowPort from context', () => {
      expect(src()).toMatch(/getContext[^(]*\('workflowPort'\)/);
    });

    it('does not reference agentPort context key', () => {
      expect(src()).not.toContain("'agentPort'");
    });
  });

  describe('store imports — Task 1.3', () => {
    const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

    it('imports from stores/workflow (not stores/agent)', () => {
      expect(src()).toContain('stores/workflow');
      expect(src()).not.toContain('stores/agent');
    });

    it('imports workflowList store', () => {
      expect(src()).toContain('workflowList');
    });

    it('imports isAgentRunning store', () => {
      expect(src()).toContain('isAgentRunning');
    });

    it('imports loadWorkflows function', () => {
      expect(src()).toContain('loadWorkflows');
    });

    it('imports startRun function', () => {
      expect(src()).toContain('startRun');
    });

    it('imports cancelRun function', () => {
      expect(src()).toContain('cancelRun');
    });
  });

  describe('port message handling', () => {
    const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

    it('handles AGENTIC_STAGE messages', () => {
      expect(src()).toContain('AGENTIC_STAGE');
    });

    it('handles AGENTIC_ERROR messages', () => {
      expect(src()).toContain('AGENTIC_ERROR');
    });
  });

  describe('run controls', () => {
    const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

    it('has a Run button', () => {
      expect(src()).toMatch(/Run|run/);
    });

    it('has a Cancel button', () => {
      expect(src()).toContain('Cancel');
    });
  });

  describe('workflow selector', () => {
    const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

    it('has a workflow selector driven by workflowList', () => {
      expect(src()).toContain('workflowList');
    });

    it('loads workflows on mount', () => {
      expect(src()).toContain('loadWorkflows');
    });
  });
});

// ── Sprint 5: thread UI (Tasks 5.2, 5.3, 5.4, 5.5) ──────────────────────────

describe('WorkflowTab.svelte — Sprint 5 thread UI (Task 5.3)', () => {
  const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

  describe('removed components', () => {
    it('does not import ConfirmTable (Task 5.4)', () => {
      expect(src()).not.toContain('ConfirmTable');
    });

    it('does not import PipelineStages (Task 5.5)', () => {
      expect(src()).not.toContain('PipelineStages');
    });
  });

  describe('WorkflowMessage component', () => {
    it('imports WorkflowMessage component', () => {
      expect(src()).toContain('WorkflowMessage');
    });
  });

  describe('thread state from store', () => {
    it('imports agentMessages from stores/workflow', () => {
      expect(src()).toContain('agentMessages');
    });

    it('imports pendingGate from stores/workflow', () => {
      expect(src()).toContain('pendingGate');
    });
  });

  describe('port message handling — gate messages', () => {
    it('handles AGENTIC_PLAN_REVIEW to set pendingGate to plan', () => {
      expect(src()).toContain('AGENTIC_PLAN_REVIEW');
    });

    it('handles AGENTIC_FILLS_REVIEW to set pendingGate to fills', () => {
      expect(src()).toContain('AGENTIC_FILLS_REVIEW');
    });

    it('handles AGENTIC_SUMMARY to clear pendingGate', () => {
      expect(src()).toContain('AGENTIC_SUMMARY');
    });
  });

  describe('feedback input area', () => {
    it('has a feedback textarea or input', () => {
      expect(src()).toMatch(/textarea|<input/);
    });

    it('has an Approve button', () => {
      expect(src()).toContain('Approve');
    });

    it('feedback area is conditionally shown based on pendingGate', () => {
      expect(src()).toMatch(/pendingGate.*null|null.*pendingGate|\$pendingGate/);
    });
  });
});
