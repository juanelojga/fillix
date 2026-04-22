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

  describe('Task 6.5 — PipelineStages.spec.ts', () => {
    it('exists', () => {
      expect(existsSync(comp('PipelineStages.spec.ts'))).toBe(true);
    });

    it('tests all 5 stage names render', () => {
      const src = readFileSync(comp('PipelineStages.spec.ts'), 'utf-8');
      expect(src).toContain('collect');
      expect(src).toContain('understand');
    });

    it('tests error stage shows error text', () => {
      const src = readFileSync(comp('PipelineStages.spec.ts'), 'utf-8');
      expect(src).toContain('error');
    });
  });

  describe('Task 6.6 — ConfirmTable.spec.ts', () => {
    it('exists', () => {
      expect(existsSync(comp('ConfirmTable.spec.ts'))).toBe(true);
    });

    it('tests one row per FieldFill entry', () => {
      const src = readFileSync(comp('ConfirmTable.spec.ts'), 'utf-8');
      expect(src).toMatch(/FieldFill|fieldId/);
    });

    it('tests editing proposed value updates editedValue', () => {
      const src = readFileSync(comp('ConfirmTable.spec.ts'), 'utf-8');
      expect(src).toContain('editedValue');
    });
  });

  describe('Task 6.7 — tab smoke tests', () => {
    it('ChatTab.spec.ts exists', () => {
      expect(existsSync(tab('ChatTab.spec.ts'))).toBe(true);
    });

    it('SettingsTab.spec.ts exists', () => {
      expect(existsSync(tab('SettingsTab.spec.ts'))).toBe(true);
    });

    it('AgentTab.spec.ts exists', () => {
      expect(existsSync(tab('AgentTab.spec.ts'))).toBe(true);
    });
  });
});
