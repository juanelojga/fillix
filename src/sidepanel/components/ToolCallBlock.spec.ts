import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ToolCallBlock from './ToolCallBlock.svelte';

describe('ToolCallBlock', () => {
  it('renders tool label in header', () => {
    render(ToolCallBlock, {
      props: { toolName: 'web_search', args: { query: 'vitest' }, result: null },
    });
    expect(screen.getByText(/Search/i)).toBeInTheDocument();
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
});
