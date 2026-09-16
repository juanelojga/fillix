import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NewsSummary from './NewsSummary.svelte';
import { newsItems, summaries, type SummaryState } from '../stores/news';
import { ollamaConfig } from '../stores/settings';
import type { NewsItem } from '../../types';

const ITEM: NewsItem = {
  id: 'hn:1',
  category: 'ai',
  title: 'A story',
  url: 'https://example.com/story',
  source: 'example.com',
  meta: '1 point',
  publishedAt: '2026-09-16T09:00:00Z',
  snippet: '',
};

const STATES: SummaryState[] = [
  { status: 'fetching' },
  { status: 'summarizing', model: 'llama3.2' },
  {
    status: 'ready',
    summary: { summary: 'It happened.', keyPoints: [] },
    model: 'llama3.2',
    elapsedMs: 14_200,
  },
  {
    status: 'error',
    stage: 'fetch',
    error: 'fetch returned 403',
    model: 'llama3.2',
    url: ITEM.url,
  },
  { status: 'error', stage: 'summarize', error: 'boom', model: 'llama3.2', url: ITEM.url },
];

beforeEach(() => {
  newsItems.set([ITEM]);
  summaries.set({});
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
});

describe('NewsSummary', () => {
  it('names the source while fetching', () => {
    summaries.set({ 'hn:1': { status: 'fetching' } });
    render(NewsSummary, { props: { item: ITEM } });

    expect(screen.getByText(/Fetching the article from example\.com/)).toBeInTheDocument();
  });

  it('names the model and the expected wait while summarizing', () => {
    summaries.set({ 'hn:1': { status: 'summarizing', model: 'llama3.2' } });
    render(NewsSummary, { props: { item: ITEM } });

    expect(screen.getByText(/llama3\.2 — usually 10–20 seconds/)).toBeInTheDocument();
  });

  it('renders the summary and its key points', () => {
    summaries.set({
      'hn:1': {
        status: 'ready',
        summary: { summary: 'It happened.', keyPoints: ['First point', 'Second point'] },
        model: 'llama3.2',
        elapsedMs: 14_200,
      },
    });
    render(NewsSummary, { props: { item: ITEM } });

    expect(screen.getByText('It happened.')).toBeInTheDocument();
    expect(screen.getByText('First point')).toBeInTheDocument();
    expect(screen.getByText(/Summarized locally by llama3\.2 in 14\.2 s/)).toBeInTheDocument();
  });

  // A worded badge alone is not enough — the raw error is what gets pasted into an issue.
  it('renders summary, hint, raw detail and attempted request for a fetch failure', () => {
    summaries.set({
      'hn:1': {
        status: 'error',
        stage: 'fetch',
        error: 'fetch returned 403',
        model: 'llama3.2',
        url: ITEM.url,
      },
    });
    render(NewsSummary, { props: { item: ITEM } });

    expect(screen.getByText("Couldn't read the article")).toBeInTheDocument();
    expect(screen.getByText(/blocked the extension/)).toBeInTheDocument();
    expect(screen.getByText('fetch returned 403')).toBeInTheDocument();
    expect(screen.getByText(`GET ${ITEM.url}`)).toBeInTheDocument();
  });

  it('points a summarize failure at Settings and the ollama endpoint', () => {
    summaries.set({
      'hn:1': {
        status: 'error',
        stage: 'summarize',
        error: 'boom',
        model: 'llama3.2',
        url: ITEM.url,
      },
    });
    render(NewsSummary, { props: { item: ITEM } });

    expect(screen.getByText(/Check the model in Settings/)).toBeInTheDocument();
    expect(screen.getByText(/POST http:\/\/localhost:11434\/api\/generate/)).toBeInTheDocument();
  });

  it('offers Try again only after a failure', () => {
    summaries.set({ 'hn:1': { status: 'summarizing', model: 'llama3.2' } });
    const { unmount } = render(NewsSummary, { props: { item: ITEM } });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    unmount();

    summaries.set({
      'hn:1': { status: 'error', stage: 'fetch', error: 'x', model: 'm', url: ITEM.url },
    });
    render(NewsSummary, { props: { item: ITEM } });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // Including while pending: if the model is slow the user can just go and read it.
  it('always offers the article link, in every state', () => {
    for (const state of STATES) {
      summaries.set({ 'hn:1': state });
      const { unmount } = render(NewsSummary, { props: { item: ITEM } });

      const link = screen.getByRole('link', { name: /Open article/ });
      expect(link.getAttribute('href')).toBe(ITEM.url);
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      unmount();
    }
  });
});
