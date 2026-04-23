import { existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const sidepanel = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('vanilla DOM deletion (Task 2.6)', () => {
  describe('deleted files no longer exist', () => {
    const deleted = ['agent.ts', 'settings.ts', 'obsidian-panel.ts', 'chat.ts', 'chat-tools.ts'];
    deleted.forEach((file) => {
      it(`${file} is gone`, () => {
        expect(existsSync(sidepanel(file))).toBe(false);
      });
    });
  });

  describe('svelte replacements exist', () => {
    const required = [
      'App.svelte',
      'tabs/ChatTab.svelte',
      'tabs/SettingsTab.svelte',
      'tabs/WorkflowTab.svelte',
      'stores/chat.ts',
      'stores/settings.ts',
      'stores/workflow.ts',
    ];
    required.forEach((file) => {
      it(`${file} exists`, () => {
        expect(existsSync(sidepanel(file))).toBe(true);
      });
    });
  });

  describe('files that must be preserved', () => {
    it('markdown.ts is kept', () => {
      expect(existsSync(sidepanel('markdown.ts'))).toBe(true);
    });

    it('app.css is kept', () => {
      expect(existsSync(sidepanel('app.css'))).toBe(true);
    });
  });
});
