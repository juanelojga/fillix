import { render } from '@testing-library/svelte';
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

  it('renders markdown while streaming', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: '**bold**', isStreaming: true },
    });
    expect(container.querySelector('.prose strong')?.textContent).toBe('bold');
  });

  it('renders markdown container when not streaming', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: '**bold**', isStreaming: false },
    });
    expect(container.querySelector('.prose')).not.toBeNull();
  });

  it('produces identical markup streaming and finalized for the same content', () => {
    const md = '## Hi\n\n- a\n- b';
    const streaming = render(MessageBubble, {
      props: { role: 'assistant', content: md, isStreaming: true },
    });
    const final = render(MessageBubble, {
      props: { role: 'assistant', content: md, isStreaming: false },
    });
    const prose = (c: Element) => c.querySelector('.prose')?.innerHTML;
    expect(prose(streaming.container)).toBe(prose(final.container));
  });

  it('shows the typing indicator only while streaming with empty content', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: '', isStreaming: true },
    });
    expect(container.querySelector('[data-testid="typing-indicator"]')).not.toBeNull();
    expect(container.querySelector('.prose')).toBeNull();
  });

  it('replaces the typing indicator with markdown once the first token arrives', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: 'a', isStreaming: true },
    });
    expect(container.querySelector('[data-testid="typing-indicator"]')).toBeNull();
    expect(container.querySelector('.prose')).not.toBeNull();
  });

  it('renders an unterminated code fence as a code block while streaming', () => {
    const { container } = render(MessageBubble, {
      props: { role: 'assistant', content: 'x:\n```js\nconst a = 1;', isStreaming: true },
    });
    expect(container.querySelector('.prose pre code')).not.toBeNull();
  });

  it('applies destructive class for error role', () => {
    const { container } = render(MessageBubble, { props: { role: 'error', content: 'oops' } });
    const prose = container.querySelector('.prose') as HTMLElement;
    expect(prose.className).toMatch(/text-destructive/);
  });
});
