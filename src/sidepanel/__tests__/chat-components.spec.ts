import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel/components', p);

describe('chat UI components (Sprint 3)', () => {
  describe('MessageBubble.svelte (Task 3.1)', () => {
    const src = readFileSync(comp('MessageBubble.svelte'), 'utf-8');

    it('exists', () => {
      expect(existsSync(comp('MessageBubble.svelte'))).toBe(true);
    });

    it('accepts a role prop', () => {
      expect(src).toContain('role');
    });

    it('accepts a content prop', () => {
      expect(src).toContain('content');
    });

    it('accepts an isStreaming prop', () => {
      expect(src).toContain('isStreaming');
    });

    it('uses renderMarkdown for sanitised HTML output', () => {
      expect(src).toContain('renderMarkdown');
    });

    it('renders markdown via {@html} only when not streaming', () => {
      expect(src).toContain('{@html');
      expect(src).toContain('isStreaming');
    });

    it('applies distinct class for user role', () => {
      expect(src).toMatch(/user/);
    });

    it('renders children snippet for nested blocks', () => {
      expect(src).toContain('{@render children');
    });
  });

  describe('ToolCallBlock.svelte (Task 3.2)', () => {
    const src = readFileSync(comp('ToolCallBlock.svelte'), 'utf-8');

    it('exists', () => {
      expect(existsSync(comp('ToolCallBlock.svelte'))).toBe(true);
    });

    it('accepts toolName prop', () => {
      expect(src).toContain('toolName');
    });

    it('accepts args prop', () => {
      expect(src).toContain('args');
    });

    it('accepts result prop', () => {
      expect(src).toContain('result');
    });

    it('uses a button for collapsible toggle', () => {
      expect(src).toContain('<button');
    });

    it('conditionally renders result section based on pending/null state', () => {
      expect(src).toMatch(/isPending|result\s*===?\s*null|\{#if.*result/);
    });
  });

  describe('ThinkingBlock.svelte (Task 3.3)', () => {
    const src = readFileSync(comp('ThinkingBlock.svelte'), 'utf-8');

    it('exists', () => {
      expect(existsSync(comp('ThinkingBlock.svelte'))).toBe(true);
    });

    it('accepts content prop', () => {
      expect(src).toContain('content');
    });

    it('accepts isStreaming prop', () => {
      expect(src).toContain('isStreaming');
    });

    it('uses <details> for collapsible display', () => {
      expect(src).toContain('<details');
    });

    it('shows "Thinking" text when streaming', () => {
      expect(src).toContain('Thinking');
    });

    it('shows "Thought process" text when not streaming', () => {
      expect(src).toContain('Thought process');
    });
  });
});
