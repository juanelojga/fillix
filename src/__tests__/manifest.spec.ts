// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import manifest from '../../manifest.config';

// Verify every external endpoint the tool layer reaches is present in
// host_permissions so background fetch calls succeed — and that the origins of
// retired capabilities (remote LLM providers, Brave web search) are gone.

const permissions: string[] = (manifest as { host_permissions?: string[] }).host_permissions ?? [];
const apiPermissions: string[] = (manifest as { permissions?: string[] }).permissions ?? [];

describe('manifest host_permissions', () => {
  const required = [
    'https://en.wikipedia.org/*',
    'https://hn.algolia.com/*',
    // The tavily_search tool. Redundant against <all_urls>, and listed anyway: this array is the
    // documented statement of which endpoints the worker is *meant* to reach.
    'https://api.tavily.com/*',
  ];

  for (const url of required) {
    it(`includes ${url}`, () => {
      expect(permissions).toContain(url);
    });
  }

  it('retains the existing ollama localhost entry', () => {
    expect(permissions).toContain('http://localhost:11434/*');
  });

  it('drops the obsidian localhost entry — the vault integration is gone', () => {
    expect(permissions).not.toContain('http://localhost:27123/*');
  });

  for (const url of [
    'https://api.openai.com/*',
    'https://openrouter.ai/*',
    'https://api.search.brave.com/*',
    // Retired with the News tab: its article links are opaque redirect pages.
    'https://news.google.com/*',
    // Retired with the workflow pipeline's message-reply task type.
    'https://web.whatsapp.com/*',
    'https://www.linkedin.com/*',
  ]) {
    it(`no longer grants ${url}`, () => {
      expect(permissions).not.toContain(url);
    });
  }
});

describe('manifest permissions', () => {
  // The Workflows tab's Capture button injects into the active tab. `activeTab` grants
  // neither the chrome.scripting namespace nor a host grant that survives a click on a
  // button inside the side panel — only a click on the extension's action mints one.
  it('grants scripting, without which chrome.scripting is undefined', () => {
    expect(apiPermissions).toContain('scripting');
  });

  it('keeps <all_urls>, which is what actually authorizes the injection', () => {
    expect(permissions).toContain('<all_urls>');
  });

  it('retains storage and sidePanel', () => {
    expect(apiPermissions).toContain('storage');
    expect(apiPermissions).toContain('sidePanel');
  });
});
