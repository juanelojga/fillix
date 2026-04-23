// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const tab = (p: string) => resolve(process.cwd(), 'src/sidepanel/tabs', p);

describe('WorkflowTab.svelte — port context (Task 1.4)', () => {
  const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

  it('WorkflowTab.svelte exists', () => {
    expect(existsSync(tab('WorkflowTab.svelte'))).toBe(true);
  });

  it('uses workflowPort context key', () => {
    expect(src()).toMatch(/getContext[^(]*\('workflowPort'\)/);
  });

  it('does not use agentPort context key', () => {
    expect(src()).not.toContain("'agentPort'");
  });
});

describe('WorkflowTab.svelte — store binding (Task 1.3)', () => {
  const src = () => readFileSync(tab('WorkflowTab.svelte'), 'utf-8');

  it('imports from stores/workflow, not stores/agent', () => {
    expect(src()).toContain('stores/workflow');
    expect(src()).not.toContain('stores/agent');
  });
});
