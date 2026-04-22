import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const sidepanel = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('app shell structure (Sprint 2)', () => {
  describe('index.html (Task 2.1)', () => {
    const html = readFileSync(sidepanel('index.html'), 'utf-8');
    const lines = html.split('\n').filter((l) => l.trim() !== '');

    it('has a #app div mount point', () => {
      expect(html).toContain('id="app"');
    });

    it('loads main.ts as a module script', () => {
      expect(html).toContain('type="module"');
      expect(html).toContain('main.ts');
    });

    it('has no inline <style> block', () => {
      expect(html).not.toContain('<style');
    });

    it('is ≤ 15 non-blank lines', () => {
      expect(lines.length).toBeLessThanOrEqual(15);
    });
  });

  describe('main.ts (Task 2.2)', () => {
    const src = readFileSync(sidepanel('main.ts'), 'utf-8');
    const lines = src.split('\n').filter((l) => l.trim() !== '');

    it('calls svelte mount()', () => {
      expect(src).toContain('mount(');
    });

    it('imports App from App.svelte', () => {
      expect(src).toContain('App.svelte');
    });

    it('imports app.css', () => {
      expect(src).toContain('app.css');
    });

    it('is ≤ 8 non-blank lines', () => {
      expect(lines.length).toBeLessThanOrEqual(8);
    });
  });

  describe('App.svelte (Task 2.3)', () => {
    const src = readFileSync(sidepanel('App.svelte'), 'utf-8');

    it('exists', () => {
      expect(existsSync(sidepanel('App.svelte'))).toBe(true);
    });

    it('uses setContext to expose chatPort', () => {
      expect(src).toContain("setContext('chatPort'");
    });

    it('uses setContext to expose agentPort', () => {
      expect(src).toContain("setContext('agentPort'");
    });

    it('imports Tabs from shadcn', () => {
      expect(src).toContain('$components/ui/tabs');
    });

    it('renders chat, settings, and agent tab triggers', () => {
      expect(src).toContain('value="chat"');
      expect(src).toContain('value="settings"');
      expect(src).toContain('value="agent"');
    });

    it('disconnects ports on cleanup', () => {
      expect(src).toContain('disconnect()');
    });
  });

  describe('stub tab components (Task 2.4)', () => {
    const tabs = ['ChatTab', 'SettingsTab', 'AgentTab'];
    tabs.forEach((tab) => {
      it(`${tab}.svelte exists`, () => {
        expect(existsSync(sidepanel(`tabs/${tab}.svelte`))).toBe(true);
      });
    });
  });
});
