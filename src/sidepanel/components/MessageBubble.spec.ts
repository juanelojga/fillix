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

  // --- Task 1.4: beautify state props (fail until Gate 4 implements them) ---

  it('shows "Polishing…" text when isBeautifying prop is true', () => {
    render(MessageBubble, {
      props: { role: 'assistant', content: 'raw', isBeautifying: true },
    });
    expect(screen.getByText('Polishing…')).toBeInTheDocument();
  });

  it('shows beautifyError label text when beautifyError prop is set', () => {
    render(MessageBubble, {
      props: { role: 'assistant', content: 'text', beautifyError: 'Could not beautify' },
    });
    expect(screen.getByText('Could not beautify')).toBeInTheDocument();
  });

  it('does not show beautifyError label when beautifyError is undefined', () => {
    render(MessageBubble, { props: { role: 'assistant', content: 'text' } });
    expect(screen.queryByText('Could not beautify')).toBeNull();
  });
});
