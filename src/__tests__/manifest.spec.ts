// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import manifest from '../../manifest.config';

// Sprint 7: verify all external endpoints used by the tool layer
// are present in host_permissions so background fetch calls succeed.

const permissions: string[] = (manifest as { host_permissions?: string[] }).host_permissions ?? [];

describe('manifest host_permissions — Sprint 7 endpoints', () => {
  const required = [
    'https://api.openai.com/*',
    'https://openrouter.ai/*',
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
});
