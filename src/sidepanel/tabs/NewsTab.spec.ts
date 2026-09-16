import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import NewsTab from './NewsTab.svelte';
import { expandedItemId, feedState, newsItems, summaries } from '../stores/news';
import type { NewsCategory, NewsItem } from '../../types';

function item(id: string, category: NewsCategory, title = `Story ${id}`): NewsItem {
  return {
    id,
    category,
    title,
    url: `https://example.com/${id}`,
    source: 'example.com',
    meta: '412 points · 3h ago',
    publishedAt: '2026-09-16T09:00:00Z',
    snippet: '',
  };
}

const SIX = [
  item('a', 'ai'),
  item('b', 'technology'),
  item('c', 'software-development'),
  item('d', 'curiosities'),
  item('e', 'ai'),
  item('f', 'technology'),
];

beforeEach(() => {
  newsItems.set([]);
  feedState.set({ status: 'idle' });
  expandedItemId.set(null);
  summaries.set({});
  vi.restoreAllMocks();
});

describe('NewsTab', () => {
  it('offers a worded Refresh button', () => {
    render(NewsTab);
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
  });

  // Pins the on-demand requirement: nothing may fetch until the button is pressed.
  it('makes no request on mount', () => {
    const spy = vi.spyOn(chrome.runtime, 'sendMessage');
    render(NewsTab);

    expect(spy).not.toHaveBeenCalled();
  });

  it('explains what Refresh will do when nothing is loaded', () => {
    render(NewsTab);

    expect(screen.getByText(/Not loaded yet — press Refresh/)).toBeInTheDocument();
    expect(screen.getByText(/Curiosities/)).toBeInTheDocument();
  });

  it('disables and rewords the button while loading', () => {
    feedState.set({ status: 'loading' });
    render(NewsTab);

    const button = screen.getByRole('button', { name: /Refreshing/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Loading the latest stories…')).toBeInTheDocument();
  });

  it('renders six rows, each with a category badge', () => {
    newsItems.set(SIX);
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: [] });
    render(NewsTab);

    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(6);
    expect(screen.getAllByText('AI')).toHaveLength(2);
    expect(screen.getByText('Curiosities')).toBeInTheDocument();
  });

  // A worded badge alone is not enough; the raw error has to be on screen too.
  it('shows both a worded failure and the raw error', () => {
    feedState.set({ status: 'error', error: 'No news sources responded (Hacker News)' });
    render(NewsTab);

    expect(screen.getAllByText("Couldn't load news").length).toBeGreaterThan(0);
    expect(screen.getByText('No news sources responded (Hacker News)')).toBeInTheDocument();
  });

  it('names the categories that did not answer on a partial failure', () => {
    newsItems.set(SIX.slice(0, 4));
    feedState.set({
      status: 'ready',
      fetchedAt: Date.now(),
      degraded: [{ category: 'technology', source: 'Hacker News', error: 'down' }],
    });
    render(NewsTab);

    expect(
      screen.getByText(/Showing 4 of 6 — the Technology feed didn't answer/),
    ).toBeInTheDocument();
  });

  it('keeps only one row expanded at a time', async () => {
    newsItems.set(SIX);
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: [] });
    summaries.set({
      a: { status: 'ready', summary: { summary: 'x', keyPoints: [] }, model: 'm', elapsedMs: 1 },
      d: { status: 'ready', summary: { summary: 'y', keyPoints: [] }, model: 'm', elapsedMs: 1 },
    });
    render(NewsTab);

    const rows = screen.getAllByRole('button', { expanded: false });
    await fireEvent.click(rows[0]!);
    await fireEvent.click(rows[3]!);

    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    expect(get(expandedItemId)).toBe('d');
  });

  it('does not call the worker when re-opening a cached story', async () => {
    newsItems.set(SIX);
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: [] });
    summaries.set({
      a: { status: 'ready', summary: { summary: 'x', keyPoints: [] }, model: 'm', elapsedMs: 1 },
    });
    const spy = vi.spyOn(chrome.runtime, 'sendMessage');
    render(NewsTab);

    await fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]!);

    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * The regression test for the TabsContent unmount hazard. bits-ui destroys the tab's
   * content when another tab is active, so expansion state kept in a component rune
   * would be lost. This fails the moment someone "simplifies" expandedItemId.
   */
  it('keeps a row expanded across an unmount and remount', async () => {
    newsItems.set(SIX);
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: [] });
    summaries.set({
      a: { status: 'ready', summary: { summary: 'x', keyPoints: [] }, model: 'm', elapsedMs: 1 },
    });

    const first = render(NewsTab);
    await fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]!);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    first.unmount();

    render(NewsTab);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
  });

  it('announces summary progress through one persistent status region', () => {
    newsItems.set(SIX);
    feedState.set({ status: 'ready', fetchedAt: Date.now(), degraded: [] });
    summaries.set({ a: { status: 'summarizing', model: 'llama3.2' } });
    expandedItemId.set('a');
    render(NewsTab);

    expect(screen.getByRole('status')).toHaveTextContent(/10 to 20 seconds/);
  });

  it('announces a feed failure with its error', () => {
    feedState.set({ status: 'error', error: 'everything is down' });
    render(NewsTab);

    expect(screen.getByRole('status')).toHaveTextContent(/everything is down/);
  });
});
