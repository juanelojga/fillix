import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AngleBrief from './AngleBrief.svelte';
import type { PostSpecifics } from '$lib/linkedin/post-specifics';
import type { TopicResearch } from '$lib/linkedin/topic-research';
import type { AngleBrief as Brief } from '$lib/linkedin/write-brief';

const BRIEF: Brief = {
  icp: 'primary',
  pillar: 'startups',
  style: 'contrarian',
  funnel: 'tofu',
  spike: 'Boring tech ships faster than the interesting kind.',
  hooks: [
    { trigger: 'curiosity', lines: ['A', 'B', 'C'] },
    { trigger: 'surprise', lines: ['D', 'E', 'F'] },
    { trigger: 'identity', lines: ['G', 'H', 'I'] },
  ],
};

const RESEARCH: TopicResearch = { evidence: '', sources: [], degraded: [] };

function props(specifics: PostSpecifics) {
  return { brief: BRIEF, research: RESEARCH, specifics, hook: 0 };
}

describe('AngleBrief', () => {
  it('shows the spike, which is what the post has to defend', () => {
    render(AngleBrief, { props: props({ text: '', headings: [], failure: null }) });
    expect(screen.getByText(/Boring tech ships faster/)).toBeTruthy();
  });

  it('shows the pillar, style, funnel stage and ICP the angle was locked to', () => {
    render(AngleBrief, { props: props({ text: '', headings: [], failure: null }) });
    for (const chip of ['Startups', 'contrarian', 'tofu', 'primary']) {
      expect(screen.getByText(chip)).toBeTruthy();
    }
  });

  /** The citation is the point: it makes a claim checkable without re-reading the profile. */
  it('names the profile sections it drew on', () => {
    render(AngleBrief, {
      props: props({ text: '## Python', headings: ['Python', 'Consulting'], failure: null }),
    });
    expect(screen.getByText(/Drew on: Python · Consulting/)).toBeTruthy();
  });

  /**
   * A stale index does not stop the post, but it does change how it reads — and the button
   * that fixes it is on the Profile tab, so the hint has to say so.
   */
  it('words a retrieval refusal and names the tab that fixes it', () => {
    render(AngleBrief, {
      props: props({ text: '', headings: [], failure: { reason: 'stale-index' } }),
    });
    expect(screen.getByText(/changed since it was indexed/i)).toBeTruthy();
    expect(screen.getByText(/Profile tab/i)).toBeTruthy();
  });

  /**
   * A profile that genuinely says nothing about this topic is not a refusal, and must not be
   * worded as one — the same distinction `retrieveFromIndex` refuses early to preserve.
   */
  it('distinguishes an empty match from a broken index', () => {
    render(AngleBrief, { props: props({ text: '', headings: [], failure: null }) });
    expect(screen.getByText(/no section matching this topic/i)).toBeTruthy();
  });

  it('offers Regenerate, and no button named Capture', () => {
    render(AngleBrief, { props: props({ text: '', headings: [], failure: null }) });
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /captur/i })).toBeNull();
  });
});
