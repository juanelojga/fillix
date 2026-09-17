import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel/components', p);
const tab = (p: string) => resolve(process.cwd(), 'src/sidepanel/tabs', p);

describe('component spec files exist (Sprint 6)', () => {
  describe('Task 6.2 — MessageBubble.spec.ts', () => {
    it('exists', () => {
      expect(existsSync(comp('MessageBubble.spec.ts'))).toBe(true);
    });

    it('tests user bubble alignment', () => {
      const src = readFileSync(comp('MessageBubble.spec.ts'), 'utf-8');
      expect(src).toMatch(/user|ml-auto/);
    });

    it('tests streaming vs markdown rendering', () => {
      const src = readFileSync(comp('MessageBubble.spec.ts'), 'utf-8');
      expect(src).toContain('isStreaming');
    });
  });

  describe('Task 6.3 — ToolCallBlock.spec.ts', () => {
    it('exists', () => {
      expect(existsSync(comp('ToolCallBlock.spec.ts'))).toBe(true);
    });

    it('tests result null → absent', () => {
      const src = readFileSync(comp('ToolCallBlock.spec.ts'), 'utf-8');
      expect(src).toContain('null');
    });
  });

  describe('Task 6.4 — ThinkingBlock.spec.ts', () => {
    it('exists', () => {
      expect(existsSync(comp('ThinkingBlock.spec.ts'))).toBe(true);
    });

    it('tests "Thinking" label when streaming', () => {
      const src = readFileSync(comp('ThinkingBlock.spec.ts'), 'utf-8');
      expect(src).toContain('Thinking');
    });

    it('tests "Thought process" label when not streaming', () => {
      const src = readFileSync(comp('ThinkingBlock.spec.ts'), 'utf-8');
      expect(src).toContain('Thought process');
    });
  });

  describe('Task 6.7 — tab smoke tests', () => {
    it('ChatTab.spec.ts exists', () => {
      expect(existsSync(tab('ChatTab.spec.ts'))).toBe(true);
    });

    it('SettingsTab.spec.ts exists', () => {
      expect(existsSync(tab('SettingsTab.spec.ts'))).toBe(true);
    });

    it('NewsTab.spec.ts exists', () => {
      expect(existsSync(tab('NewsTab.spec.ts'))).toBe(true);
    });

    it('WorkflowsTab.spec.ts exists and covers the Capture button and the playbook picker', () => {
      expect(existsSync(tab('WorkflowsTab.spec.ts'))).toBe(true);
      const src = readFileSync(tab('WorkflowsTab.spec.ts'), 'utf-8');
      expect(src).toContain('Capture');
      // The button is one of two controls now — the picker chooses what it runs.
      expect(src).toContain('playbook');
    });
  });

  describe('Model pickers', () => {
    it('ModelPicker.spec.ts covers the presentational contract', () => {
      expect(existsSync(comp('ModelPicker.spec.ts'))).toBe(true);
      const src = readFileSync(comp('ModelPicker.spec.ts'), 'utf-8');
      expect(src).toContain('onSelect');
    });

    it('ChatModelPicker.spec.ts exists and pins the ollama-key write', () => {
      expect(existsSync(comp('ChatModelPicker.spec.ts'))).toBe(true);
      const src = readFileSync(comp('ChatModelPicker.spec.ts'), 'utf-8');
      expect(src).toContain('ollama');
    });

    it('NewsModelPicker.spec.ts exists and pins the newsConfig-key write', () => {
      expect(existsSync(comp('NewsModelPicker.spec.ts'))).toBe(true);
      const src = readFileSync(comp('NewsModelPicker.spec.ts'), 'utf-8');
      expect(src).toContain('newsConfig');
    });

    it('PlaybookPicker.spec.ts exists and pins the workflowsConfig-key write', () => {
      expect(existsSync(comp('PlaybookPicker.spec.ts'))).toBe(true);
      const src = readFileSync(comp('PlaybookPicker.spec.ts'), 'utf-8');
      expect(src).toContain('workflowsConfig');
    });
  });

  describe('Capture components', () => {
    it('CapturedHtml.spec.ts exists and pins that markup renders as text', () => {
      expect(existsSync(comp('CapturedHtml.spec.ts'))).toBe(true);
      const src = readFileSync(comp('CapturedHtml.spec.ts'), 'utf-8');
      expect(src).toContain('pre h1');
    });
  });

  describe('News row components', () => {
    it('NewsItemRow.spec.ts exists and covers the disclosure contract', () => {
      expect(existsSync(comp('NewsItemRow.spec.ts'))).toBe(true);
      const src = readFileSync(comp('NewsItemRow.spec.ts'), 'utf-8');
      expect(src).toContain('aria-controls');
    });

    it('NewsSummary.spec.ts exists and covers the failure detail', () => {
      expect(existsSync(comp('NewsSummary.spec.ts'))).toBe(true);
      const src = readFileSync(comp('NewsSummary.spec.ts'), 'utf-8');
      expect(src).toContain('summarizing');
    });
  });
});
