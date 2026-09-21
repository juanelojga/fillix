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

describe('ToolCallBlock — tavily_search', () => {
  const RESULT =
    '1. Svelte 5 is alive\n' +
    'https://svelte.dev/blog/svelte-5-is-alive · 2026-09-14\n' +
    'Runes are a new reactivity system built on signals.\n' +
    '\n' +
    '2. Vue 3 — the Composition API guide\n' +
    'https://vuejs.org/guide\n' +
    'Composition API replaces the options object.';

  async function expand(props: Record<string, unknown>) {
    const rendered = render(ToolCallBlock, { props: props as never });
    await screen.getByRole('button').click();
    return rendered;
  }

  it('resolves its own label rather than falling back to the raw tool name', () => {
    render(ToolCallBlock, {
      props: { toolName: 'tavily_search', args: { query: 'svelte 5' }, result: null },
    });
    expect(screen.getByText(/Search/)).toBeInTheDocument();
  });

  // Reads `query` by name, not by position: this is the first tool that can arrive with several
  // args, and the order of keys in the model's JSON is its own whim.
  it('shows the query in the header even when it is not the first arg', () => {
    render(ToolCallBlock, {
      props: {
        toolName: 'tavily_search',
        args: { topic: 'news', query: 'ollama releases' },
        result: null,
      },
    });
    expect(screen.getByText(/ollama releases/)).toBeInTheDocument();
  });

  it('renders results through its own list, never the removed result-list', async () => {
    const { container } = await expand({
      toolName: 'tavily_search',
      args: { query: 'svelte 5' },
      result: RESULT,
    });
    expect(container.querySelector('.search-list')).not.toBeNull();
    expect(container.querySelector('.result-list')).toBeNull();
    expect(container.querySelectorAll('.search-row')).toHaveLength(2);
  });

  /**
   * The reason the block format differs from news_feed's one-liner. `parseList`'s lazy title group
   * would split this title at the first em dash and render it as "Vue 3", with the remainder folded
   * into the snippet.
   */
  it('keeps a title containing an em dash intact', async () => {
    await expand({ toolName: 'tavily_search', args: { query: 'vue' }, result: RESULT });
    expect(screen.getByText('Vue 3 — the Composition API guide')).toBeInTheDocument();
  });

  it('links each result and shows where it came from', async () => {
    await expand({ toolName: 'tavily_search', args: { query: 'svelte 5' }, result: RESULT });
    const link = screen.getByRole('link', { name: /Svelte 5 is alive/ });
    expect(link).toHaveAttribute('href', 'https://svelte.dev/blog/svelte-5-is-alive');
    expect(screen.getByText('svelte.dev')).toBeInTheDocument();
  });

  it('styles a refusal as an error rather than parsing it as a result', async () => {
    const { container } = await expand({
      toolName: 'tavily_search',
      args: { query: 'q' },
      result: 'Error: Tavily rejected the key. Copy the key again.',
    });
    expect(container.querySelector('.err')).not.toBeNull();
    expect(container.querySelector('.search-list')).toBeNull();
  });

  // "No web results" is prose, not a block, so there is nothing to list — an empty <ul> would
  // read as a rendering bug rather than as an answer.
  it('falls back to raw text when nothing parses into a block', async () => {
    const { container } = await expand({
      toolName: 'tavily_search',
      args: { query: 'q' },
      result: 'No web results for that query.',
    });
    expect(container.querySelector('.search-list')).toBeNull();
    expect(screen.getByText(/No web results/)).toBeInTheDocument();
  });
});
