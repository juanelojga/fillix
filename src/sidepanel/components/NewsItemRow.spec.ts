import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import NewsItemRow from './NewsItemRow.svelte';
import { expandedItemId, newsItems, summaries } from '../stores/news';
import type { NewsItem } from '../../types';

const ITEM: NewsItem = {
  id: 'hn:1',
  category: 'ai',
  title: 'A rather long headline that should wrap across several lines at panel width',
  url: 'https://example.com/story',
  source: 'example.com',
  meta: '412 points · 8 comments · 3h ago',
  publishedAt: '2026-09-16T09:00:00Z',
  snippet: '',
};

beforeEach(() => {
  newsItems.set([ITEM]);
  expandedItemId.set(null);
  summaries.set({});
});

describe('NewsItemRow', () => {
  // Renders with no context map — the reason this is a hand-rolled disclosure rather
  // than a shadcn Accordion, whose item throws outside an Accordion root.
  it('renders standalone', () => {
    render(NewsItemRow, { props: { item: ITEM } });
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('shows the category as a word, not just a colour', () => {
    render(NewsItemRow, { props: { item: ITEM } });
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('shows the source and meta line', () => {
    render(NewsItemRow, { props: { item: ITEM } });
    expect(screen.getByText(/example\.com · 412 points/)).toBeInTheDocument();
  });

  it('clamps the headline to three lines rather than truncating it to one', () => {
    const { container } = render(NewsItemRow, { props: { item: ITEM } });
    expect(container.querySelector('.line-clamp-3')).toBeTruthy();
  });

  it('expands on click and records it in the store', async () => {
    render(NewsItemRow, { props: { item: ITEM } });
    await fireEvent.click(screen.getByRole('button'));

    expect(get(expandedItemId)).toBe('hn:1');
  });

  it('pairs the panel with its trigger for screen readers', async () => {
    render(NewsItemRow, { props: { item: ITEM } });
    const trigger = screen.getByRole('button');
    await fireEvent.click(trigger);

    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(trigger.getAttribute('aria-controls')).toBe(region.id);
  });

  it('words the busy state in the collapsed row', () => {
    summaries.set({ 'hn:1': { status: 'summarizing', model: 'llama3.2' } });
    render(NewsItemRow, { props: { item: ITEM } });

    expect(screen.getByText('Summarizing…')).toBeInTheDocument();
  });

  it('words a failed summary in the collapsed row', () => {
    summaries.set({
      'hn:1': { status: 'error', stage: 'fetch', error: 'boom', model: 'm', url: 'https://x' },
    });
    render(NewsItemRow, { props: { item: ITEM } });

    expect(screen.getByText('Summary failed')).toBeInTheDocument();
  });
});
