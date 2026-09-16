import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('SettingsTab.svelte', () => {
  const src = readFileSync(comp('tabs/SettingsTab.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(comp('tabs/SettingsTab.svelte'))).toBe(true);
  });

  describe('store imports', () => {
    it('imports ollamaConfig store', () => {
      expect(src).toContain('ollamaConfig');
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

  describe('ollama section', () => {
    it('has a base URL input field', () => {
      expect(src).toContain('baseUrl');
    });

    it('wires up the manual model-list actions', () => {
      for (const fn of ['addModel', 'removeModel', 'setActiveModel', 'testModel']) {
        expect(src).toContain(fn);
      }
    });

    it('offers no remote provider options', () => {
      for (const provider of ['openai', 'openrouter', 'PROVIDER_DEFAULTS']) {
        expect(src).not.toContain(provider);
      }
    });

    it('has no API key input for the LLM provider', () => {
      expect(src).not.toContain('apiKey');
    });

    it('does not fetch the available models from Ollama', () => {
      expect(src).not.toContain('refreshModels');
      expect(src).not.toContain('LIST_MODELS');
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

    it('uses ObsidianPanel component', () => {
      expect(src).toContain('ObsidianPanel');
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
