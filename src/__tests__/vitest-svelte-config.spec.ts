import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('vitest Svelte component test configuration (Task 6.1)', () => {
  describe('vitest.config.ts test block', () => {
    const src = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf-8');

    it('includes a test configuration block', () => {
      expect(src).toContain('test:');
    });

    it('sets default environment to node', () => {
      expect(src).toContain("environment: 'node'");
    });

    it('registers a setupFiles entry', () => {
      expect(src).toContain('setupFiles');
    });

    it('includes src/**/*.spec.ts in test include glob', () => {
      expect(src).toMatch(/include.*spec\.ts|spec\.ts.*include/);
    });
  });

  describe('src/test-setup.ts', () => {
    const setupPath = resolve(process.cwd(), 'src/test-setup.ts');

    it('exists', () => {
      expect(existsSync(setupPath)).toBe(true);
    });

    it('imports @testing-library/jest-dom for extended matchers', () => {
      const src = readFileSync(setupPath, 'utf-8');
      expect(src).toContain('@testing-library/jest-dom');
    });

    it('stubs the chrome global', () => {
      const src = readFileSync(setupPath, 'utf-8');
      expect(src).toContain('chrome');
    });
  });
});
