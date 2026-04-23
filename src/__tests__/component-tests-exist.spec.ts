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

  describe('Task 6.5 — WorkflowMessage.spec.ts (replaced PipelineStages)', () => {
    it('exists', () => {
      expect(existsSync(comp('WorkflowMessage.spec.ts'))).toBe(true);
    });

    it('tests plan-review variant', () => {
      const src = readFileSync(comp('WorkflowMessage.spec.ts'), 'utf-8');
      expect(src).toContain('plan-review');
    });

    it('tests summary variant', () => {
      const src = readFileSync(comp('WorkflowMessage.spec.ts'), 'utf-8');
      expect(src).toContain('summary');
    });
  });

  describe('Task 6.6 — WorkflowMessage fills-review (replaced ConfirmTable)', () => {
    it('WorkflowMessage.spec.ts covers fills-review', () => {
      const src = readFileSync(comp('WorkflowMessage.spec.ts'), 'utf-8');
      expect(src).toContain('fills-review');
    });

    it('WorkflowMessage.spec.ts covers replyText', () => {
      const src = readFileSync(comp('WorkflowMessage.spec.ts'), 'utf-8');
      expect(src).toContain('replyText');
    });

    it('WorkflowMessage.spec.ts covers error variant', () => {
      const src = readFileSync(comp('WorkflowMessage.spec.ts'), 'utf-8');
      expect(src).toContain('error');
    });
  });

  describe('Task 6.7 — tab smoke tests', () => {
    it('ChatTab.spec.ts exists', () => {
      expect(existsSync(tab('ChatTab.spec.ts'))).toBe(true);
    });

    it('SettingsTab.spec.ts exists', () => {
      expect(existsSync(tab('SettingsTab.spec.ts'))).toBe(true);
    });

    it('WorkflowTab.spec.ts exists', () => {
      expect(existsSync(tab('WorkflowTab.spec.ts'))).toBe(true);
    });
  });
});
