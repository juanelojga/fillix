import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('vite svelte configuration', () => {
  const src = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8');

  describe('plugin imports (Task 1.2)', () => {
    it('imports @sveltejs/vite-plugin-svelte', () => {
      expect(src).toContain('@sveltejs/vite-plugin-svelte');
    });

    it('imports @tailwindcss/vite', () => {
      expect(src).toContain('@tailwindcss/vite');
    });
  });

  describe('plugin order (Task 1.2)', () => {
    it('places svelte() before tailwindcss()', () => {
      const svelteIdx = src.indexOf('svelte()');
      const tailwindIdx = src.indexOf('tailwindcss()');
      expect(svelteIdx).toBeGreaterThan(-1);
      expect(tailwindIdx).toBeGreaterThan(-1);
      expect(svelteIdx).toBeLessThan(tailwindIdx);
    });

    it('places tailwindcss() before crx()', () => {
      const tailwindIdx = src.indexOf('tailwindcss()');
      const crxIdx = src.indexOf('crx(');
      expect(tailwindIdx).toBeGreaterThan(-1);
      expect(crxIdx).toBeGreaterThan(-1);
      expect(tailwindIdx).toBeLessThan(crxIdx);
    });
  });

  describe('path aliases (Task 1.2)', () => {
    it('defines $lib alias', () => {
      expect(src).toContain('$lib');
    });

    it('defines $components alias', () => {
      expect(src).toContain('$components');
    });
  });
});
