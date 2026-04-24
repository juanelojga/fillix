import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const mainPath = resolve(process.cwd(), 'src/sidepanel/main.ts');

describe('main.ts — Svelte entry point', () => {
  it('exists', () => {
    expect(existsSync(mainPath)).toBe(true);
  });

  it('mounts App with mount()', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('mount(App,');
  });

  it('targets document.getElementById("app")', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain("getElementById('app')");
  });

  it('imports App from App.svelte', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('App.svelte');
  });

  it('imports app.css', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('app.css');
  });
});
