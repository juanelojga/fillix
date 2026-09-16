// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import manifest from '../../manifest.config';

// Verify every external endpoint the tool layer reaches is present in
// host_permissions so background fetch calls succeed — and that the retired
// remote-LLM origins are gone now that Fillix is Ollama-only.

const permissions: string[] = (manifest as { host_permissions?: string[] }).host_permissions ?? [];

describe('manifest host_permissions', () => {
  const required = [
    'https://api.search.brave.com/*',
    'https://en.wikipedia.org/*',
    'https://news.google.com/*',
  ];

  for (const url of required) {
    it(`includes ${url}`, () => {
      expect(permissions).toContain(url);
    });
  }

  it('retains the existing ollama localhost entry', () => {
    expect(permissions).toContain('http://localhost:11434/*');
  });

  it('retains the existing obsidian localhost entry', () => {
    expect(permissions).toContain('http://localhost:27123/*');
  });

  for (const url of ['https://api.openai.com/*', 'https://openrouter.ai/*']) {
    it(`no longer grants ${url}`, () => {
      expect(permissions).not.toContain(url);
    });
  }
});
