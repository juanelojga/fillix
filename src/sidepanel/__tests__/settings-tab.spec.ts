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

    /**
     * Ollama runs over loopback and needs no credential — that is what this has always asserted,
     * and it stays true. It used to be a blunt `not.toContain('apiKey')` over the whole file,
     * which also banned the Tavily search key that now lives in its own section below. Narrowed to
     * the provider-era identifiers so it keeps catching what it meant to catch.
     */
    it('has no API key input for the LLM provider', () => {
      for (const token of ['ollamaApiKey', 'openaiApiKey', 'providerApiKey', 'PROVIDER_DEFAULTS']) {
        expect(src).not.toContain(token);
      }
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

  describe('web search section', () => {
    it('wires up the Tavily key store actions', () => {
      for (const fn of ['tavilyApiKey', 'saveTavilyKey', 'clearTavilyKey', 'testTavilyKey']) {
        expect(src).toContain(fn);
      }
    });

    // A credential is not shoulder-readable.
    it('masks the key field', () => {
      expect(src).toContain('type="password"');
    });

    // Tavily's failure set — a rejected key, a spent quota, a rate limit — has no overlap with
    // diagnoseTestFailure's, whose 404 arm would tell the user to run "ollama pull".
    it('diagnoses a failed key test with the Tavily module, not the Ollama one', () => {
      expect(src).toContain('diagnoseTavilyFailure');
    });

    // The key rides on its own Save, not the page-level Save Settings button, which writes only
    // the Ollama config.
    it('gives the key its own save control', () => {
      expect(src).toContain('Save key');
    });

    it('says where the key goes and that the tool is off without one', () => {
      expect(src).toContain('api.tavily.com');
      expect(src).toContain("isn't told the search tool exists");
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
