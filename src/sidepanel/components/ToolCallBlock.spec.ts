import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ToolCallBlock from './ToolCallBlock.svelte';

describe('ToolCallBlock', () => {
  it('renders tool name in summary', () => {
    render(ToolCallBlock, {
      props: { toolName: 'web_search', args: { query: 'vitest' }, result: null },
    });
    expect(screen.getByText(/web_search/)).toBeInTheDocument();
  });

  it('shows primary arg in summary', () => {
    render(ToolCallBlock, {
      props: { toolName: 'web_search', args: { query: 'svelte 5' }, result: null },
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

  it('renders result when result is a string', () => {
    render(ToolCallBlock, {
      props: {
        toolName: 'wikipedia',
        args: { topic: 'AI' },
        result: 'AI stands for Artificial Intelligence.',
      },
    });
    expect(screen.getByText(/AI stands for/)).toBeInTheDocument();
  });

  it('lists all args as key-value pairs', () => {
    render(ToolCallBlock, {
      props: {
        toolName: 'fetch_url',
        args: { url: 'https://example.com', method: 'GET' },
        result: null,
      },
    });
    // arg keys appear in the list; url also appears in the summary, so use getAllBy
    expect(screen.getAllByText(/url/).length).toBeGreaterThan(0);
    expect(screen.getByText(/method/)).toBeInTheDocument();
  });
});
