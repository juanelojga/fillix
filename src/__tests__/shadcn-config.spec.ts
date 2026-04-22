import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('shadcn-svelte setup', () => {
  describe('components.json (Task 1.5)', () => {
    const configPath = resolve(process.cwd(), 'components.json');

    it('exists at project root', () => {
      expect(existsSync(configPath)).toBe(true);
    });

    it('uses $components alias — not the $lib default', () => {
      const raw = readFileSync(configPath, 'utf-8');
      expect(raw).toContain('$components');
      expect(raw).not.toContain('$lib/components');
    });
  });

  describe('app.css (Task 1.5)', () => {
    const cssPath = resolve(process.cwd(), 'src/sidepanel/app.css');

    it('exists', () => {
      expect(existsSync(cssPath)).toBe(true);
    });

    it('imports tailwindcss', () => {
      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toMatch(/@import ['"]tailwindcss['"]/);
    });

    it('contains shadcn CSS variable block', () => {
      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toContain('--background');
      expect(css).toContain('--foreground');
    });
  });

  describe('utils.ts (Task 1.5)', () => {
    it('exists at components path', () => {
      expect(existsSync(resolve(process.cwd(), 'src/sidepanel/components/utils.ts'))).toBe(true);
    });
  });

  describe('shadcn UI components (Task 1.6)', () => {
    const uiDir = resolve(process.cwd(), 'src/sidepanel/components/ui');
    const required = [
      'button',
      'tabs',
      'textarea',
      'input',
      'select',
      'badge',
      'accordion',
      'separator',
      'tooltip',
      'scroll-area',
      'table',
    ];

    required.forEach((component) => {
      it(`${component} directory exists`, () => {
        expect(existsSync(resolve(uiDir, component))).toBe(true);
      });
    });
  });
});
