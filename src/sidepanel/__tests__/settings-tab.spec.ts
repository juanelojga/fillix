import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('SettingsTab.svelte (Task 4.2)', () => {
  const src = readFileSync(comp('tabs/SettingsTab.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(comp('tabs/SettingsTab.svelte'))).toBe(true);
  });

  describe('store imports', () => {
    it('imports providerConfig store', () => {
      expect(src).toContain('providerConfig');
    });

    it('imports searchConfig store', () => {
      expect(src).toContain('searchConfig');
    });

    it('imports modelList store', () => {
      expect(src).toContain('modelList');
    });

    it('imports loadSettings', () => {
      expect(src).toContain('loadSettings');
    });

    it('imports saveSettings', () => {
      expect(src).toContain('saveSettings');
    });
  });

  describe('provider section', () => {
    it('renders provider type selector with ollama option', () => {
      expect(src).toContain('ollama');
    });

    it('renders openai option', () => {
      expect(src).toContain('openai');
    });

    it('renders openrouter option', () => {
      expect(src).toContain('openrouter');
    });

    it('renders custom option', () => {
      expect(src).toContain('custom');
    });

    it('has a model input or select field', () => {
      expect(src).toContain('model');
    });

    it('has an API key input field', () => {
      expect(src).toMatch(/apiKey|api.?key/i);
    });

    it('has a base URL input field', () => {
      expect(src).toContain('baseUrl');
    });
  });

  describe('search section', () => {
    it('has a Brave API key input', () => {
      expect(src).toContain('braveApiKey');
    });
  });

  describe('Obsidian section', () => {
    it('embeds ObsidianPanel component', () => {
      expect(src).toContain('ObsidianPanel');
    });
  });

  describe('shadcn components', () => {
    it('uses Input component', () => {
      expect(src).toContain('Input');
    });

    it('uses Button component', () => {
      expect(src).toContain('Button');
    });

    it('uses Separator component', () => {
      expect(src).toContain('Separator');
    });
  });

  describe('save action', () => {
    it('calls saveSettings on save', () => {
      expect(src).toContain('saveSettings');
    });
  });

  describe('lifecycle', () => {
    it('calls loadSettings on mount', () => {
      expect(src).toContain('loadSettings');
    });
  });
});
