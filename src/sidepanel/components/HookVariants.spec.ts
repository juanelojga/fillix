import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import HookVariants from './HookVariants.svelte';
import { composerState, resetComposer } from '../stores/composer';
import type { HookVariant } from '$lib/linkedin/write-brief';

const HOOKS: HookVariant[] = [
  { trigger: 'curiosity', lines: ['A one', 'A two', 'A three'] },
  { trigger: 'surprise', lines: ['B one', 'B two', 'B three'] },
  { trigger: 'identity', lines: ['C one', 'C two', 'C three'] },
];

const BRIEF = {
  icp: 'primary' as const,
  pillar: 'startups' as const,
  style: 'contrarian' as const,
  funnel: 'tofu' as const,
  spike: 'Boring tech ships.',
  hooks: HOOKS,
};

beforeEach(() => {
  resetComposer();
});

describe('HookVariants', () => {
  it('shows all three lines of every hook', () => {
    render(HookVariants, { props: { hooks: HOOKS, selected: 0 } });
    for (const hook of HOOKS)
      for (const line of hook.lines) expect(screen.getByText(line)).toBeTruthy();
  });

  it('shows each hook’s trigger and its length against the limit', () => {
    render(HookVariants, { props: { hooks: HOOKS, selected: 0 } });
    expect(screen.getByText(/curiosity · \d+\/210 characters/)).toBeTruthy();
  });

  /** A radio group, not checkboxes: one hook becomes the post's first three lines. */
  it('marks exactly one hook as chosen', () => {
    render(HookVariants, { props: { hooks: HOOKS, selected: 1 } });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
    expect(radios[1].checked).toBe(true);
  });

  it('writes the choice to the store', async () => {
    composerState.set({
      stage: 'brief',
      topic: { title: 'T', angle: 'A', pillar: 'startups' },
      status: 'ready',
      research: { evidence: '', sources: [], degraded: [] },
      brief: BRIEF,
      specifics: { text: '', headings: [], failure: null },
      hook: 0,
    });
    render(HookVariants, { props: { hooks: HOOKS, selected: 0 } });
    await fireEvent.change(screen.getAllByRole('radio')[2]);
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.hook).toBe(2);
  });
});
