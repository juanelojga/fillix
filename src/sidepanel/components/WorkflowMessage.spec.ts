// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const componentPath = resolve(process.cwd(), 'src/sidepanel/components/WorkflowMessage.svelte');

const src = () => readFileSync(componentPath, 'utf-8');

describe('WorkflowMessage.svelte — source integrity (Task 5.2)', () => {
  it('exists at src/sidepanel/components/WorkflowMessage.svelte', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('accepts a message prop', () => {
    expect(src()).toMatch(/message\s*[:=]/);
  });

  it('has no store imports (single responsibility — rendering only)', () => {
    expect(src()).not.toContain("from '../stores/workflow'");
    expect(src()).not.toContain("from '../../lib/agent-runner'");
  });

  it('has no chrome API calls (rendering only)', () => {
    expect(src()).not.toContain('chrome.runtime');
    expect(src()).not.toContain('port.postMessage');
  });

  describe('plan-review variant', () => {
    it('renders plan-review kind', () => {
      expect(src()).toContain('plan-review');
    });

    it('renders fields_to_fill list', () => {
      expect(src()).toContain('fields_to_fill');
    });

    it('renders missing_fields list', () => {
      expect(src()).toContain('missing_fields');
    });

    it('renders tone', () => {
      expect(src()).toContain('tone');
    });
  });

  describe('fills-review variant', () => {
    it('renders fills-review kind', () => {
      expect(src()).toContain('fills-review');
    });

    it('renders form fills (label + proposed value)', () => {
      expect(src()).toMatch(/proposedValue|proposed_value|label/);
    });

    it('renders reply text block for message-reply (Task 6.2)', () => {
      expect(src()).toContain('replyText');
    });
  });

  describe('user-feedback variant', () => {
    it('renders user-feedback kind', () => {
      expect(src()).toContain('user-feedback');
    });
  });

  describe('summary variant', () => {
    it('renders summary kind', () => {
      expect(src()).toContain('summary');
    });

    it('renders applied count', () => {
      expect(src()).toContain('applied');
    });

    it('renders skipped count', () => {
      expect(src()).toContain('skipped');
    });
  });

  describe('error variant', () => {
    it('renders error kind', () => {
      expect(src()).toMatch(/'error'|kind.*error/);
    });
  });
});

// ── Task 5.4 / 5.5 — deleted component verification ──────────────────────────

describe('ConfirmTable.svelte — deleted (Task 5.4)', () => {
  const confirmTablePath = resolve(process.cwd(), 'src/sidepanel/components/ConfirmTable.svelte');
  const confirmSpecPath = resolve(process.cwd(), 'src/sidepanel/components/ConfirmTable.spec.ts');

  it('ConfirmTable.svelte has been deleted', () => {
    expect(existsSync(confirmTablePath)).toBe(false);
  });

  it('ConfirmTable.spec.ts has been deleted', () => {
    expect(existsSync(confirmSpecPath)).toBe(false);
  });
});

describe('PipelineStages.svelte — deleted (Task 5.5)', () => {
  const pipelineStagesPath = resolve(
    process.cwd(),
    'src/sidepanel/components/PipelineStages.svelte',
  );
  const pipelineSpecPath = resolve(
    process.cwd(),
    'src/sidepanel/components/PipelineStages.spec.ts',
  );

  it('PipelineStages.svelte has been deleted', () => {
    expect(existsSync(pipelineStagesPath)).toBe(false);
  });

  it('PipelineStages.spec.ts has been deleted', () => {
    expect(existsSync(pipelineSpecPath)).toBe(false);
  });
});
