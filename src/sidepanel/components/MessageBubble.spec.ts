import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import MessageBubble from './MessageBubble.svelte';

describe('MessageBubble', () => {
  it('renders user bubble aligned right with justify-end', () => {
    const { container } = render(MessageBubble, { props: { role: 'user', content: 'Hello' } });
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble.className).toMatch(/justify-end/);
  });

  it('renders assistant bubble without ml-auto', () => {
    const { container } = render(MessageBubble, { props: { role: 'assistant', content: 'Hi' } });
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble.className).not.toMatch(/ml-auto/);
  });

  it('renders plain text when isStreaming is true', () => {
    render(MessageBubble, {
      props: { role: 'assistant', content: 'streaming...', isStreaming: true },
    });
    expect(screen.getByText('streaming...')).toBeInTheDocument();
  });

  it('renders markdown container when not streaming', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: '**bold**', isStreaming: false },
    });
    expect(container.querySelector('.prose')).not.toBeNull();
  });

  it('applies destructive class for error role', () => {
    const { container } = render(MessageBubble, { props: { role: 'error', content: 'oops' } });
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toMatch(/text-destructive/);
  });
});
