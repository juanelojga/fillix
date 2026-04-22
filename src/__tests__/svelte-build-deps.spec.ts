import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

interface PackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

describe('svelte build dependencies', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'),
  ) as PackageJson;

  describe('runtime dependencies (Task 1.1)', () => {
    it('includes svelte 5', () => {
      expect(pkg.dependencies).toHaveProperty('svelte');
      const version = pkg.dependencies['svelte'].replace(/^[\^~>=<]+/, '');
      expect(version).toMatch(/^5/);
    });

    it('includes bits-ui', () => {
      expect(pkg.dependencies).toHaveProperty('bits-ui');
    });

    it('includes clsx', () => {
      expect(pkg.dependencies).toHaveProperty('clsx');
    });

    it('includes tailwind-merge', () => {
      expect(pkg.dependencies).toHaveProperty('tailwind-merge');
    });
  });

  describe('dev dependencies (Task 1.1)', () => {
    it('includes @sveltejs/vite-plugin-svelte', () => {
      expect(pkg.devDependencies).toHaveProperty('@sveltejs/vite-plugin-svelte');
    });

    it('includes tailwindcss 4', () => {
      expect(pkg.devDependencies).toHaveProperty('tailwindcss');
      const version = pkg.devDependencies['tailwindcss'].replace(/^[\^~>=<]+/, '');
      expect(version).toMatch(/^4/);
    });

    it('includes @tailwindcss/vite', () => {
      expect(pkg.devDependencies).toHaveProperty('@tailwindcss/vite');
    });

    it('includes svelte-check', () => {
      expect(pkg.devDependencies).toHaveProperty('svelte-check');
    });

    it('includes @testing-library/svelte', () => {
      expect(pkg.devDependencies).toHaveProperty('@testing-library/svelte');
    });

    it('includes @testing-library/jest-dom', () => {
      expect(pkg.devDependencies).toHaveProperty('@testing-library/jest-dom');
    });
  });

  describe('typecheck script (Task 1.4)', () => {
    it('chains svelte-check before tsc --noEmit', () => {
      const script = pkg.scripts['typecheck'] ?? '';
      expect(script).toContain('svelte-check');
      expect(script).toContain('tsc --noEmit');
      expect(script.indexOf('svelte-check')).toBeLessThan(script.indexOf('tsc --noEmit'));
    });
  });
});
