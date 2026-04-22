import { describe, it, expect } from 'vitest';

describe('svelte render debug', () => {
  it('can dynamically import a svelte component', async () => {
    const mod = await import('../sidepanel/components/ThinkingBlock.svelte');
    expect(mod).toBeTruthy();
    expect(typeof mod.default).toBe('function');
  });
});
