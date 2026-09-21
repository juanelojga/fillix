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
  onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
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

/** A port that hands back the listeners ChatTab registers, so tests can drive them. */
function makePort() {
  const listeners: ((msg: unknown) => void)[] = [];
  const dropListeners: (() => void)[] = [];
  return {
    port: {
      postMessage: vi.fn(),
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => listeners.push(fn),
        removeListener: (fn: (msg: unknown) => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
      onDisconnect: {
        addListener: (fn: () => void) => dropListeners.push(fn),
        removeListener: (fn: () => void) => {
          const i = dropListeners.indexOf(fn);
          if (i >= 0) dropListeners.splice(i, 1);
        },
      },
      disconnect: vi.fn(),
    },
    emit: (msg: PortMessage) => listeners.forEach((fn) => fn(msg)),
    /** Chrome tore the port down — the background is gone mid-stream. */
    drop: () => dropListeners.forEach((fn) => fn()),
    listenerCount: () => listeners.length,
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

  it('resets the UI before notifying the background, so a dead port cannot strand it', async () => {
    const { port, emit } = makePort();
    // Posting to a port Chrome already closed throws; if stop reset the UI after
    // that call, the panel stayed stuck streaming with nothing left to cancel.
    let stateWhenPosted: string | null = null;
    port.postMessage.mockImplementation(() => {
      stateWhenPosted = get(streamingState);
    });
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'token', value: 'partial' });
    await fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await tick();

    expect(stateWhenPosted).toBe('idle');
    expect(get(streamingState)).toBe('idle');
    expect(get(messages).at(-1)?.content).toBe('partial');
  });

  it('reports a dropped connection instead of streaming forever', async () => {
    const { port, emit, drop } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'token', value: 'half an answer' });
    drop();
    await tick();

    expect(get(streamingState)).toBe('idle');
    expect(get(activeMessage)).toBeNull();
    expect(get(messages).at(-1)?.content).toContain('half an answer');
    expect(get(messages).at(-1)?.content).toMatch(/lost the connection/i);
  });

  it('ignores a drop that lands while idle', async () => {
    const { port, drop } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });

    drop();
    await tick();

    expect(get(messages)).toEqual([]);
  });

  it('unregisters its port listeners on unmount, so a remount cannot double tokens', async () => {
    const { port, listenerCount } = makePort();
    const { unmount } = render(ChatTab, { context: new Map([['chatPort', port]]) });
    expect(listenerCount()).toBe(1);

    unmount();
    await tick();

    expect(listenerCount()).toBe(0);
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

  // The model can search the profile twice in one turn — one broad query, then a narrower
  // one. Matching a tool-result by name alone gave both calls the second result, and keying
  // the {#each} by name made two calls of one name a duplicate-key error.
  it('gives two calls of the same tool their own results', async () => {
    const { port, emit } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'tool-call', toolName: 'profile_search', args: { query: 'Python' } });
    await tick();
    emit({ type: 'tool-result', toolName: 'profile_search', result: '## Python' });
    await tick();
    emit({ type: 'tool-call', toolName: 'profile_search', args: { query: 'Go' } });
    await tick();
    emit({ type: 'tool-result', toolName: 'profile_search', result: '## Go' });
    await tick();

    const calls = get(activeMessage)?.toolCalls ?? [];
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ args: { query: 'Python' }, result: '## Python' });
    expect(calls[1]).toMatchObject({ args: { query: 'Go' }, result: '## Go' });
  });

  it('renders both calls of one tool without a duplicate-key error', async () => {
    const { port, emit } = makePort();
    const { container } = render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'tool-call', toolName: 'profile_search', args: { query: 'Python' } });
    emit({ type: 'tool-result', toolName: 'profile_search', result: '## Python' });
    emit({ type: 'tool-call', toolName: 'profile_search', args: { query: 'Go' } });
    emit({ type: 'tool-result', toolName: 'profile_search', result: '## Go' });
    await tick();

    expect(container.querySelectorAll('.tool-wrap')).toHaveLength(2);
  });

  // A result arriving for a name with nothing pending must not overwrite a settled call.
  it('ignores a tool-result with no pending call of that name', async () => {
    const { port, emit } = makePort();
    render(ChatTab, { context: new Map([['chatPort', port]]) });
    await startTurn();

    emit({ type: 'tool-call', toolName: 'wikipedia', args: { title: 'Svelte' } });
    emit({ type: 'tool-result', toolName: 'wikipedia', result: 'first' });
    emit({ type: 'tool-result', toolName: 'wikipedia', result: 'second' });
    await tick();

    expect(get(activeMessage)?.toolCalls[0].result).toBe('first');
  });
});
