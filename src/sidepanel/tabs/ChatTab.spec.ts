import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import ChatTab from './ChatTab.svelte';
import { messages, activeMessage, streamingState } from '../stores/chat';
import type { PortMessage } from '../../types';

const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

describe('ChatTab (smoke)', () => {
  const context = new Map([['chatPort', mockPort]]);

  it('renders without crashing', () => {
    expect(() => render(ChatTab, { context })).not.toThrow();
  });

  it('renders a textarea for user input', () => {
    render(ChatTab, { context });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders a send button', () => {
    render(ChatTab, { context });
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(ChatTab, { context });
    const btn = screen.getByRole('button', { name: /send/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

/** A port that hands back the listener ChatTab registers, so tests can drive it. */
function makePort() {
  const listeners: ((msg: unknown) => void)[] = [];
  return {
    port: {
      postMessage: vi.fn(),
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => listeners.push(fn),
        removeListener: vi.fn(),
      },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    },
    emit: (msg: PortMessage) => listeners.forEach((fn) => fn(msg)),
  };
}

/** Types a prompt and sends it, so an activeMessage exists to stream into. */
async function startTurn() {
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'hi' } });
  await fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

describe('ChatTab — streamed token handling', () => {
  beforeEach(() => {
    messages.set([]);
    activeMessage.set(null);
    streamingState.set('idle');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders streamed tokens as markdown once the coalescing interval elapses', async () => {
    const { port, emit } = makePort();
    const { container } = render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'token', value: '**bold**' });
    await tick();
    expect(container.querySelector('.prose strong')).toBeNull();

    vi.advanceTimersByTime(60);
    await tick();

    expect(container.querySelector('.prose strong')?.textContent).toBe('bold');
  });

  it('does not lose buffered tokens when done arrives before the interval elapses', async () => {
    const { port, emit } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'token', value: 'first half ' });
    vi.advanceTimersByTime(60);
    // `done` lands inside the next open window; the tail must still be committed.
    emit({ type: 'token', value: 'the tail' });
    emit({ type: 'done' });
    await tick();

    expect(get(messages).at(-1)?.content).toBe('first half the tail');
  });

  it('does not lose buffered tokens when the user presses stop mid-window', async () => {
    const { port, emit } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'token', value: 'partial answer' });
    await fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await tick();

    expect(get(messages).at(-1)?.content).toBe('partial answer');
  });

  it('scrolls the sentinel into view as streamed content grows', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const { port, emit } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();
    await tick();
    const afterStart = spy.mock.calls.length;

    emit({ type: 'token', value: 'one' });
    vi.advanceTimersByTime(60);
    await tick();
    const afterFirst = spy.mock.calls.length;

    emit({ type: 'token', value: ' two' });
    vi.advanceTimersByTime(60);
    await tick();
    const afterSecond = spy.mock.calls.length;

    expect(afterFirst).toBeGreaterThan(afterStart);
    expect(afterSecond).toBeGreaterThan(afterFirst);
  });
});
