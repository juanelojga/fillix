import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'path';

export default defineConfig({
  plugins: [...svelte(), svelteTesting()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $components: path.resolve('./src/sidepanel/components'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts', './src/test-setup.ts'],
    environmentMatchGlobs: [
      ['src/sidepanel/components/*.spec.ts', 'jsdom'],
      ['src/sidepanel/tabs/*.spec.ts', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.svelte'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
