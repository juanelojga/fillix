import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ThinkingBlock from './ThinkingBlock.svelte';

describe('ThinkingBlock', () => {
  it('shows "Thinking…" label when isStreaming is true', () => {
    render(ThinkingBlock, { props: { content: 'reasoning...', isStreaming: true } });
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('shows "Thought process" label when not streaming', () => {
    render(ThinkingBlock, { props: { content: 'my reasoning', isStreaming: false } });
    expect(screen.getByText('Thought process')).toBeInTheDocument();
  });

  it('defaults to not streaming', () => {
    render(ThinkingBlock, { props: { content: 'my reasoning' } });
    expect(screen.getByText('Thought process')).toBeInTheDocument();
  });

  it('renders content inside the details block', () => {
    render(ThinkingBlock, { props: { content: 'step by step analysis', isStreaming: false } });
    expect(screen.getByText('step by step analysis')).toBeInTheDocument();
  });
});
