import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ComposerFailure from './ComposerFailure.svelte';
import type { PostDiagnosis } from '$lib/linkedin/post-diagnostics';

const diagnosis: PostDiagnosis = {
  stage: 'brief',
  cause: 'bad-json',
  summary: 'The model did not answer in the required format',
  hint: 'Press Regenerate.',
  detail: 'The model returned invalid JSON\nraw reply here',
  context: 'writing the angle brief · POST http://localhost:11434/api/generate',
};

describe('ComposerFailure', () => {
  /**
   * All four parts. A status badge with no worded cause and no next step is the failure mode
   * the diagnostics convention exists to stop.
   */
  it('renders the summary, hint, context and detail', () => {
    render(ComposerFailure, { props: { diagnosis } });
    expect(screen.getByText(diagnosis.summary)).toBeTruthy();
    expect(screen.getByText(diagnosis.hint)).toBeTruthy();
    expect(screen.getByText(diagnosis.context)).toBeTruthy();
    expect(screen.getByText(/raw reply here/)).toBeTruthy();
  });

  /** An unbounded model reply would push everything else off a 240px panel. */
  it('bounds the raw detail rather than letting it grow without limit', () => {
    const { container } = render(ComposerFailure, { props: { diagnosis } });
    expect(container.querySelector('.max-h-24')).not.toBeNull();
  });
});
