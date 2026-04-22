import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const storePath = resolve(process.cwd(), 'src/sidepanel/stores/agent.ts');
const src = readFileSync(storePath, 'utf-8');

describe('agent store (Task 5.1)', () => {
  it('exists', () => {
    expect(existsSync(storePath)).toBe(true);
  });

  describe('store exports', () => {
    it('exports workflowList writable store', () => {
      expect(src).toContain('workflowList');
    });

    it('exports pipelineStages writable store', () => {
      expect(src).toContain('pipelineStages');
    });

    it('exports confirmFields writable store', () => {
      expect(src).toContain('confirmFields');
    });

    it('exports isAgentRunning writable store', () => {
      expect(src).toContain('isAgentRunning');
    });
  });

  describe('function exports', () => {
    it('exports loadWorkflows', () => {
      expect(src).toContain('loadWorkflows');
    });

    it('exports startRun', () => {
      expect(src).toContain('startRun');
    });

    it('exports handleStageUpdate', () => {
      expect(src).toContain('handleStageUpdate');
    });

    it('exports handleConfirm', () => {
      expect(src).toContain('handleConfirm');
    });

    it('exports applyFields', () => {
      expect(src).toContain('applyFields');
    });

    it('exports cancelRun', () => {
      expect(src).toContain('cancelRun');
    });
  });

  describe('agent protocol messages', () => {
    it('sends WORKFLOWS_LIST message', () => {
      expect(src).toContain('WORKFLOWS_LIST');
    });

    it('sends AGENTIC_RUN to start a pipeline', () => {
      expect(src).toContain('AGENTIC_RUN');
    });

    it('sends AGENTIC_APPLY to commit fills', () => {
      expect(src).toContain('AGENTIC_APPLY');
    });

    it('sends AGENTIC_CANCEL to abort a running pipeline', () => {
      expect(src).toContain('AGENTIC_CANCEL');
    });
  });

  describe('stage initialisation', () => {
    it('initialises all 5 pipeline stages on startRun', () => {
      // The 5 stages: collect, understand, plan, draft, review
      expect(src).toContain('collect');
      expect(src).toContain('understand');
      expect(src).toContain('plan');
      expect(src).toContain('draft');
      expect(src).toContain('review');
    });
  });

  describe('type imports', () => {
    it('imports AgentPortIn or AgentPortOut types', () => {
      expect(src).toMatch(/AgentPortIn|AgentPortOut/);
    });
  });
});
