import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('ObsidianPanel.svelte (Task 4.3)', () => {
  const src = readFileSync(comp('components/ObsidianPanel.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(comp('components/ObsidianPanel.svelte'))).toBe(true);
  });

  describe('props', () => {
    it('accepts an obsidianConfig prop or reads from storage', () => {
      expect(src).toContain('obsidian');
    });
  });

  describe('connection fields', () => {
    it('has a host input field', () => {
      expect(src).toContain('host');
    });

    it('has a port input field', () => {
      expect(src).toContain('port');
    });

    it('has an API key input field', () => {
      expect(src).toContain('apiKey');
    });

    it('has a system prompt path field', () => {
      expect(src).toMatch(/systemPromptPath|system.?prompt.?path/i);
    });
  });

  describe('test connection', () => {
    it('has a test connection button', () => {
      expect(src).toMatch(/test.?connection|OBSIDIAN_TEST_CONNECTION/i);
    });

    it('sends OBSIDIAN_TEST_CONNECTION message', () => {
      expect(src).toContain('OBSIDIAN_TEST_CONNECTION');
    });
  });

  describe('collapsible layout', () => {
    it('uses Accordion for collapsible display', () => {
      expect(src).toContain('Accordion');
    });
  });

  describe('save action', () => {
    it('calls setObsidianConfig or saveSettings on save', () => {
      expect(src).toMatch(/setObsidianConfig|saveSettings/);
    });
  });

  describe('beautifier prompt path field (Task 2.3)', () => {
    it('has a beautifierPromptPath input field', () => {
      expect(src).toMatch(/beautifierPromptPath|beautifier.?prompt.?path/i);
    });
  });

  describe('shadcn components', () => {
    it('uses Input component', () => {
      expect(src).toContain('Input');
    });

    it('uses Button component', () => {
      expect(src).toContain('Button');
    });
  });
});
