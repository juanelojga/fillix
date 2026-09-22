import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TopicChoices from './TopicChoices.svelte';
import { seed } from '../stores/composer';
import type { TopicSuggestion } from '$lib/linkedin/suggest-topics';

const TOPICS: TopicSuggestion[] = [
  { title: 'Boring tech ships', angle: 'Why', pillar: 'startups' },
  { title: 'Deleting code', angle: 'What senior looks like', pillar: 'career' },
];

beforeEach(() => {
  seed.set('');
});

describe('TopicChoices', () => {
  it('writes the seed straight through to the store', async () => {
    render(TopicChoices, { props: { topics: [] } });
    const box = screen.getByLabelText(/Seed/);
    await fireEvent.input(box, { target: { value: 'boring tech' } });
    expect(get(seed)).toBe('boring tech');
  });

  it('says the seed is optional, because an empty one is a supported input', () => {
    render(TopicChoices, { props: { topics: [] } });
    expect(screen.getByText('(optional)')).toBeTruthy();
  });

  /**
   * The seed box is never disabled during a run, the rule the model pickers follow: the seed
   * is read when the button is pressed, so typing mid-run simply feeds the next press.
   */
  it('leaves the seed box editable even with no topics yet', () => {
    render(TopicChoices, { props: { topics: [] } });
    expect((screen.getByLabelText(/Seed/) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('renders one card per topic', () => {
    render(TopicChoices, { props: { topics: TOPICS } });
    expect(screen.getByText('Boring tech ships')).toBeTruthy();
    expect(screen.getByText('Deleting code')).toBeTruthy();
  });

  it('shows no topics heading before anything has run', () => {
    render(TopicChoices, { props: { topics: [] } });
    expect(screen.queryByText('Topics')).toBeNull();
  });
});
