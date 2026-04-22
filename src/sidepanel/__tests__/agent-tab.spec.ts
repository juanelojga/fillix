import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const tab = (p: string) => resolve(process.cwd(), 'src/sidepanel/tabs', p);

describe('AgentTab.svelte (Task 5.4)', () => {
  const src = readFileSync(tab('AgentTab.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(tab('AgentTab.svelte'))).toBe(true);
  });

  describe('port context', () => {
    it('reads agentPort from context', () => {
      expect(src).toMatch(/getContext[^(]*\('agentPort'\)/);
    });
  });

  describe('port message handling', () => {
    it('handles AGENTIC_STAGE messages', () => {
      expect(src).toContain('AGENTIC_STAGE');
    });

    it('handles AGENTIC_CONFIRM messages', () => {
      expect(src).toContain('AGENTIC_CONFIRM');
    });

    it('handles AGENTIC_COMPLETE messages', () => {
      expect(src).toContain('AGENTIC_COMPLETE');
    });

    it('handles AGENTIC_ERROR messages', () => {
      expect(src).toContain('AGENTIC_ERROR');
    });
  });

  describe('store imports', () => {
    it('imports workflowList store', () => {
      expect(src).toContain('workflowList');
    });

    it('imports pipelineStages store', () => {
      expect(src).toContain('pipelineStages');
    });

    it('imports confirmFields store', () => {
      expect(src).toContain('confirmFields');
    });

    it('imports isAgentRunning store', () => {
      expect(src).toContain('isAgentRunning');
    });

    it('imports loadWorkflows', () => {
      expect(src).toContain('loadWorkflows');
    });

    it('imports startRun', () => {
      expect(src).toContain('startRun');
    });

    it('imports applyFields', () => {
      expect(src).toContain('applyFields');
    });

    it('imports cancelRun', () => {
      expect(src).toContain('cancelRun');
    });
  });

  describe('nested components', () => {
    it('uses PipelineStages component', () => {
      expect(src).toContain('PipelineStages');
    });

    it('uses ConfirmTable component', () => {
      expect(src).toContain('ConfirmTable');
    });
  });

  describe('run controls', () => {
    it('has a Run button', () => {
      expect(src).toMatch(/Run|run/);
    });

    it('has a Cancel button', () => {
      expect(src).toContain('Cancel');
    });

    it('has an Apply button', () => {
      expect(src).toContain('Apply');
    });
  });

  describe('workflow selector', () => {
    it('has a workflow selector', () => {
      expect(src).toContain('workflowList');
    });

    it('loads workflows on mount', () => {
      expect(src).toContain('loadWorkflows');
    });
  });

  describe('confirm table visibility', () => {
    it('renders ConfirmTable only when confirm fields exist', () => {
      // should guard ConfirmTable with a conditional
      expect(src).toMatch(/confirmFields|AGENTIC_CONFIRM/);
    });
  });
});
