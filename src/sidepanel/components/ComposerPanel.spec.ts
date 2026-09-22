import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ComposerPanel from './ComposerPanel.svelte';
import { composerState, seed } from '../stores/composer';
import type { PostDiagnosis } from '$lib/linkedin/post-diagnostics';

const DESCRIPTION = 'Suggest topics reads your voice spec.';

const diagnosis: PostDiagnosis = {
  stage: 'topics',
  cause: 'unreachable',
  summary: "Can't reach Ollama",
  hint: 'Check that "ollama serve" is running, then press Suggest topics.',
  detail: 'Failed to fetch',
  context: 'suggesting topics · POST http://localhost:11434/api/generate',
};

beforeEach(() => {
  seed.set('');
  composerState.set({ stage: 'topics', status: 'idle' });
});

describe('ComposerPanel', () => {
  it('shows the playbook description as its empty state', () => {
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
  });

  it('says what is happening in words, never a bare spinner', () => {
    composerState.set({ stage: 'topics', status: 'running' });
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(/Reading your voice spec and pillars/)).toBeTruthy();
  });

  /**
   * All four of summary, hint, context and detail. A status badge with no worded cause and
   * no next step is the failure mode this codebase's diagnostics convention exists to stop.
   */
  it('renders every part of a diagnosis', () => {
    composerState.set({ stage: 'topics', status: 'failed', diagnosis });
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText("Can't reach Ollama")).toBeTruthy();
    expect(screen.getByText(/ollama serve/)).toBeTruthy();
    expect(screen.getByText(/api\/generate/)).toBeTruthy();
    expect(screen.getByText('Failed to fetch')).toBeTruthy();
  });

  it('keeps the seed box on screen through a failure, so a retry needs no retyping', () => {
    seed.set('boring tech');
    composerState.set({ stage: 'topics', status: 'failed', diagnosis });
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect((screen.getByLabelText(/Seed/) as HTMLTextAreaElement).value).toBe('boring tech');
  });

  it('renders the topics once they are ready', () => {
    composerState.set({
      stage: 'topics',
      status: 'ready',
      topics: [{ title: 'Boring tech ships', angle: 'Why', pillar: 'startups' }],
    });
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText('Boring tech ships')).toBeTruthy();
  });

  /**
   * Said on screen rather than left to be discovered by hunting for a button that is not
   * there. LinkedIn's composer is a contenteditable, so a fill would fail silently.
   */
  it('says posts are copied, never typed into LinkedIn', () => {
    render(ComposerPanel, { props: { description: DESCRIPTION } });
    expect(screen.getByText(/copied, never typed into LinkedIn/)).toBeTruthy();
  });

  it('offers no fill control in any state', () => {
    for (const state of [
      { stage: 'topics', status: 'idle' } as const,
      { stage: 'topics', status: 'ready', topics: [] } as const,
    ]) {
      composerState.set(state);
      const { unmount } = render(ComposerPanel, { props: { description: DESCRIPTION } });
      expect(screen.queryByRole('button', { name: /fill/i })).toBeNull();
      unmount();
    }
  });
});
