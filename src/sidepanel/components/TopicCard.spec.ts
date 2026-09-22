import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TopicCard from './TopicCard.svelte';
import type { TopicSuggestion } from '$lib/linkedin/suggest-topics';

const topic: TopicSuggestion = {
  title: 'Boring tech ships',
  angle: 'The dull stack wins more often than the interesting one',
  pillar: 'startups',
};

describe('TopicCard', () => {
  it('shows the title and the angle', () => {
    render(TopicCard, { props: { topic, index: 0 } });
    expect(screen.getByText('Boring tech ships')).toBeTruthy();
    expect(screen.getByText(/dull stack wins/)).toBeTruthy();
  });

  /**
   * One pillar per post is a rule the voice spec states, and the brief will be locked to
   * this one. Showing it is what lets a mis-filed topic be caught before a post is written
   * from it.
   */
  it('shows the pillar, never a bare topic', () => {
    render(TopicCard, { props: { topic, index: 0 } });
    expect(screen.getByText('Startups')).toBeTruthy();
  });

  it('numbers its own button so the label is unique across five cards', () => {
    render(TopicCard, { props: { topic, index: 2 } });
    expect(screen.getByRole('button', { name: 'Use topic 3' })).toBeTruthy();
  });
});
