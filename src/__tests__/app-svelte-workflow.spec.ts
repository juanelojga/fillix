// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const appSrc = readFileSync(resolve(process.cwd(), 'src/sidepanel/App.svelte'), 'utf-8');

describe('App.svelte — tab label (Task 1.6)', () => {
  it('has TabsTrigger with value="workflow"', () => {
    expect(appSrc).toContain('value="workflow"');
  });

  it('has "Workflow" as the tab label text', () => {
    expect(appSrc).toMatch(/TabsTrigger[^>]*value="workflow"[^>]*>[\s]*Workflow/);
  });

  it('has TabsContent with value="workflow"', () => {
    expect(appSrc).toMatch(/TabsContent[^>]*value="workflow"/);
  });

  it('does not have a tab trigger with value="agent"', () => {
    expect(appSrc).not.toMatch(/TabsTrigger[^>]*value="agent"/);
  });

  it('does not have TabsContent with value="agent"', () => {
    expect(appSrc).not.toMatch(/TabsContent[^>]*value="agent"/);
  });
});

describe('App.svelte — port name (Task 1.4)', () => {
  it('connects on port named "workflow"', () => {
    expect(appSrc).toContain("name: 'workflow'");
  });

  it('does not connect on port named "agent"', () => {
    expect(appSrc).not.toContain("name: 'agent'");
  });

  it('sets workflowPort context key', () => {
    expect(appSrc).toContain("'workflowPort'");
  });

  it('does not set agentPort context key', () => {
    expect(appSrc).not.toContain("'agentPort'");
  });
});

describe('App.svelte — component imports (Task 1.3)', () => {
  it('imports WorkflowTab (not AgentTab)', () => {
    expect(appSrc).toContain('WorkflowTab');
    expect(appSrc).not.toContain('AgentTab');
  });
});
