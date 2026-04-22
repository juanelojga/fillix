import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

interface TsConfig {
  compilerOptions: {
    strict?: boolean;
    noUnusedLocals?: boolean;
    noUnusedParameters?: boolean;
    noFallthroughCasesInSwitch?: boolean;
    types?: string[];
    [key: string]: unknown;
  };
  include?: string[];
}

describe('typescript configuration for svelte', () => {
  const tsconfig = JSON.parse(
    readFileSync(resolve(process.cwd(), 'tsconfig.json'), 'utf-8'),
  ) as TsConfig;

  describe('include patterns (Task 1.3)', () => {
    it('includes .svelte files', () => {
      expect(tsconfig.include).toEqual(
        expect.arrayContaining([expect.stringContaining('.svelte')]),
      );
    });

    it('still includes .ts files', () => {
      const hasTs = tsconfig.include?.some((p) => p.includes('.ts'));
      expect(hasTs).toBe(true);
    });
  });

  describe('compiler types (Task 1.3)', () => {
    it('adds svelte type declarations', () => {
      expect(tsconfig.compilerOptions.types).toContain('svelte');
    });

    it('preserves chrome type declarations', () => {
      expect(tsconfig.compilerOptions.types).toContain('chrome');
    });
  });

  describe('preserved strict settings (Task 1.3)', () => {
    it('keeps strict mode enabled', () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('keeps noUnusedLocals enabled', () => {
      expect(tsconfig.compilerOptions.noUnusedLocals).toBe(true);
    });

    it('keeps noUnusedParameters enabled', () => {
      expect(tsconfig.compilerOptions.noUnusedParameters).toBe(true);
    });

    it('keeps noFallthroughCasesInSwitch enabled', () => {
      expect(tsconfig.compilerOptions.noFallthroughCasesInSwitch).toBe(true);
    });
  });
});
