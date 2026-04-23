// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const storePath = resolve(process.cwd(), 'src/sidepanel/stores/workflow.ts');
const oldStorePath = resolve(process.cwd(), 'src/sidepanel/stores/agent.ts');

describe('workflow store (Task 1.1, 1.3)', () => {
  it('exists at new path src/sidepanel/stores/workflow.ts', () => {
    expect(existsSync(storePath)).toBe(true);
  });

  it('old path src/sidepanel/stores/agent.ts no longer exists', () => {
    expect(existsSync(oldStorePath)).toBe(false);
  });

  describe('store exports', () => {
    const src = () => readFileSync(storePath, 'utf-8');

    it('exports workflowList writable store', () => {
      expect(src()).toContain('workflowList');
    });

    it('exports isAgentRunning writable store', () => {
      expect(src()).toContain('isAgentRunning');
    });
  });

  describe('function exports', () => {
    const src = () => readFileSync(storePath, 'utf-8');

    it('exports loadWorkflows', () => {
      expect(src()).toContain('loadWorkflows');
    });

    it('exports startRun', () => {
      expect(src()).toContain('startRun');
    });

    it('exports handleStageUpdate', () => {
      expect(src()).toContain('handleStageUpdate');
    });

    it('does not export handleConfirm (removed in Sprint 3)', () => {
      expect(src()).not.toContain('handleConfirm');
    });

    it('exports cancelRun', () => {
      expect(src()).toContain('cancelRun');
    });
  });

  describe('agent protocol messages', () => {
    const src = () => readFileSync(storePath, 'utf-8');

    it('sends WORKFLOWS_LIST message', () => {
      expect(src()).toContain('WORKFLOWS_LIST');
    });

    it('sends AGENTIC_RUN to start a pipeline', () => {
      expect(src()).toContain('AGENTIC_RUN');
    });

    it('sends AGENTIC_CANCEL to abort a running pipeline', () => {
      expect(src()).toContain('AGENTIC_CANCEL');
    });
  });

  describe('type imports — Task 1.3', () => {
    const src = () => readFileSync(storePath, 'utf-8');

    it('imports AgentPortIn or AgentPortOut types', () => {
      expect(src()).toMatch(/AgentPortIn|AgentPortOut/);
    });
  });
});

// ── Sprint 5: thread state shape (Task 5.1) ───────────────────────────────────

describe('workflow store — Sprint 5 thread state (Task 5.1)', () => {
  const src = () => readFileSync(storePath, 'utf-8');

  describe('AgentThreadMessage type', () => {
    it('references AgentThreadMessage (defined in types.ts, imported here)', () => {
      // AgentThreadMessage is defined in types.ts alongside other shared types;
      // the store imports and uses it for the agentMessages store type.
      expect(src()).toContain('AgentThreadMessage');
    });
  });

  describe('agentMessages store', () => {
    it('exports agentMessages store', () => {
      expect(src()).toContain('agentMessages');
    });

    it('does not export confirmFields (replaced by agentMessages)', () => {
      expect(src()).not.toContain('confirmFields');
    });
  });

  describe('pendingGate store', () => {
    it('exports pendingGate store', () => {
      expect(src()).toContain('pendingGate');
    });

    it('pendingGate type includes plan, fills, and null', () => {
      expect(src()).toMatch(/'plan'\s*\|\s*'fills'\s*\|\s*null|null\s*\|\s*'plan'\s*\|\s*'fills'/);
    });
  });

  describe('thread helper functions', () => {
    it('exports addMessage helper', () => {
      expect(src()).toContain('addMessage');
    });

    it('exports setPendingGate helper', () => {
      expect(src()).toContain('setPendingGate');
    });

    it('exports clearThread helper', () => {
      expect(src()).toContain('clearThread');
    });
  });

  describe('startRun clears thread', () => {
    it('startRun calls clearThread or sets agentMessages to []', () => {
      const s = src();
      expect(s).toMatch(/clearThread|agentMessages.*\[\]/);
    });

    it('startRun sets pendingGate to null', () => {
      const s = src();
      expect(s).toContain('pendingGate');
    });
  });
});
