// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import { parseWorkflow } from '../workflow';

const MINIMAL_VALID = `---
name: Test Workflow
---

Fill the form with user profile data.
`;

const FULL_WORKFLOW = `---
name: Job Application
task_type: form
tone: casual
required_profile_fields:
  - name
  - email
review: false
log_full_output: true
auto_apply: true
---

You are a professional form filler. Use the provided profile.
`;

const MISSING_NAME = `---
task_type: form
---

Some body.
`;

describe('parseWorkflow', () => {
  it('sets id to the vaultPath argument', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.id).toBe('workflows/test.md');
  });

  it('parses name from frontmatter', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.name).toBe('Test Workflow');
  });

  it('sets systemPrompt to the trimmed markdown body below the frontmatter', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.systemPrompt).toBe('Fill the form with user profile data.');
  });

  it('applies default taskType: "form" when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.taskType).toBe('form');
  });

  it('applies default tone: "professional" when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.tone).toBe('professional');
  });

  it('applies default review: true when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.review).toBe(true);
  });

  it('applies default logFullOutput: true when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.logFullOutput).toBe(true);
  });

  it('applies default autoApply: false when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.autoApply).toBe(false);
  });

  it('applies default requiredProfileFields: [] when absent', () => {
    const result = parseWorkflow('workflows/test.md', MINIMAL_VALID);
    expect(result.requiredProfileFields).toEqual([]);
  });

  it('maps snake_case task_type to camelCase taskType', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.taskType).toBe('form');
  });

  it('maps snake_case required_profile_fields to requiredProfileFields', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.requiredProfileFields).toEqual(['name', 'email']);
  });

  it('maps snake_case log_full_output to logFullOutput', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.logFullOutput).toBe(true);
  });

  it('maps snake_case auto_apply to autoApply', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.autoApply).toBe(true);
  });

  it('overrides default tone when frontmatter tone is set', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.tone).toBe('casual');
  });

  it('overrides default review when frontmatter review is false', () => {
    const result = parseWorkflow('workflows/full.md', FULL_WORKFLOW);
    expect(result.review).toBe(false);
  });

  it('throws a descriptive error including the vault path when name is missing', () => {
    expect(() => parseWorkflow('workflows/bad.md', MISSING_NAME)).toThrow(/workflows\/bad\.md/);
  });

  it('throws when no frontmatter block is present at all', () => {
    expect(() => parseWorkflow('workflows/raw.md', 'Just a raw file with no YAML.')).toThrow();
  });
});
