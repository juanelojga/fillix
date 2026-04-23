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
