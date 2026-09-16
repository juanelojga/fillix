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

  describe('retired web search', () => {
    for (const token of ['searchConfig', 'SearchConfig', 'braveApiKey', 'brave-api-key']) {
      it(`no longer references ${token}`, () => {
        expect(src).not.toContain(token);
      });
    }

    // Catches the visible label text too, not just the identifiers.
    it('shows nothing about Brave', () => {
      expect(src.toLowerCase()).not.toContain('brave');
    });
  });

  describe('system prompt section', () => {
    it('no longer embeds the retired ObsidianPanel', () => {
      expect(src).not.toContain('ObsidianPanel');
    });

    it('renders a textarea bound to the prompt override', () => {
      expect(src).toContain('Textarea');
      expect(src).toContain('bind:value={promptText}');
    });

    it('shows the packaged prompt as the placeholder', () => {
      expect(src).toContain('DEFAULT_SYSTEM_PROMPT');
      expect(src).toContain('placeholder={DEFAULT_SYSTEM_PROMPT}');
    });

    it('offers a reset back to the packaged default', () => {
      expect(src).toContain('resetSystemPrompt');
      expect(src).toContain('Reset to default');
    });

    it('persists the override through the settings store', () => {
      expect(src).toContain('saveSystemPrompt');
    });
  });

  describe('shadcn components', () => {
    it('uses Input component', () => {
      expect(src).toContain('Input');
    });

    it('uses Button component', () => {
      expect(src).toContain('Button');
    });

    it('uses the Textarea primitive rather than a bare element', () => {
      expect(src).toContain('$components/ui/textarea');
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
