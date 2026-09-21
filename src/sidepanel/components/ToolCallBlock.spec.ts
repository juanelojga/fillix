import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ToolCallBlock from './ToolCallBlock.svelte';

describe('ToolCallBlock', () => {
  it('renders tool label in header', () => {
    render(ToolCallBlock, {
      props: { toolName: 'news_feed', args: { topic: 'vitest' }, result: null },
    });
    expect(screen.getByText(/News/i)).toBeInTheDocument();
  });

  it('shows primary arg in summary', () => {
    render(ToolCallBlock, {
      props: { toolName: 'news_feed', args: { topic: 'svelte 5' }, result: null },
    });
    // The primary arg appears in both the summary label and the args list
    expect(screen.getAllByText(/svelte 5/).length).toBeGreaterThan(0);
  });

  it('does not render result section when result is null', () => {
    const { container } = render(ToolCallBlock, {
      props: { toolName: 'wikipedia', args: { topic: 'AI' }, result: null },
    });
    expect(container.querySelector('.border-t')).toBeNull();
  });

  it('renders result after toggling expand', async () => {
    render(ToolCallBlock, {
      props: {
        toolName: 'fetch_url',
        args: { url: 'https://example.com' },
        result: 'page content here',
      },
    });
    const btn = screen.getByRole('button');
    await btn.click();
    expect(screen.getByText(/page content here/)).toBeInTheDocument();
  });

  it('shows primary arg value in header', () => {
    render(ToolCallBlock, {
      props: {
        toolName: 'fetch_url',
        args: { url: 'https://example.com' },
        result: null,
      },
    });
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });

  // web_search is retired: it must fall through to the raw-name label rather than
  // resolving a TOOLS entry, and its render branch must be gone.
  it('falls back to the raw name for the retired web_search tool', () => {
    render(ToolCallBlock, {
      props: { toolName: 'web_search', args: { query: 'vitest' }, result: null },
    });
    expect(screen.getByText('web_search')).toBeInTheDocument();
  });

  // parseList is shared with the deleted web_search branch — this proves news_feed
  // still renders through .news-list and nothing reaches the removed .result-list.
  it('renders news_feed results via news-list, not the removed result-list', async () => {
    const { container } = render(ToolCallBlock, {
      props: {
        toolName: 'news_feed',
        args: { topic: 'AI' },
        result: '1. Headline — 2026-01-01 (https://example.com/x)',
      },
    });
    await screen.getByRole('button').click();
    expect(container.querySelector('.news-list')).not.toBeNull();
    expect(container.querySelector('.result-list')).toBeNull();
  });

  // A chat reply is free-form prose with no JSON envelope, so nothing can enforce a citation
  // the way `draft-answer.ts` discards a draft whose `drew_on` is empty. The chips are what
  // make the grounding checkable instead.
  it('lists the retrieved ## headings as chips for profile_search', async () => {
    const { container } = render(ToolCallBlock, {
      props: {
        toolName: 'profile_search',
        args: { query: 'Python' },
        result: '## Python\n\nEight years.\n\n---\n\n## Backend\n\nAPIs and queues.',
      },
    });

    await screen.getByRole('button').click();

    const chips = [...container.querySelectorAll('.chip')].map((el) => el.textContent);
    expect(chips).toEqual(['Python', 'Backend']);
    expect(container.querySelector('.raw-text')?.textContent).toContain('Eight years.');
  });

  it('labels the profile tools in the header', () => {
    render(ToolCallBlock, {
      props: { toolName: 'meeting_availability', args: {}, result: null },
    });
    expect(screen.getByText(/Hours/i)).toBeInTheDocument();
  });

  it('styles a retrieval refusal as an error rather than as retrieved content', async () => {
    const { container } = render(ToolCallBlock, {
      props: {
        toolName: 'profile_search',
        args: { query: 'Python' },
        result: 'Error: Your profile changed since it was indexed. Open the Profile tab.',
      },
    });

    await screen.getByRole('button').click();

    expect(container.querySelector('.err')).not.toBeNull();
    expect(container.querySelector('.chip')).toBeNull();
  });
});
