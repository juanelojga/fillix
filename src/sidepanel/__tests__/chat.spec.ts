// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createChatController, type ChatState } from '../chat';
import type { PortMessage } from '../../types';

// Mock chrome.runtime.connect
const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

vi.stubGlobal('chrome', {
  runtime: {
    connect: vi.fn(() => mockPort),
  },
});

describe('createChatController', () => {
  let onToken: Mock;
  let onDone: Mock;
  let onError: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    onToken = vi.fn();
    onDone = vi.fn();
    onError = vi.fn();
    mockPort.postMessage = vi.fn();
    mockPort.onMessage.addListener = vi.fn();
    mockPort.onDisconnect.addListener = vi.fn();
    (chrome.runtime.connect as Mock).mockReturnValue(mockPort);
  });

  // ── Initial state ──────────────────────────────────────────────

  it('starts with empty messages and idle state', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    expect(ctrl.messages).toEqual([]);
    expect(ctrl.state).toBe<ChatState>('idle');
  });

  // ── send() ─────────────────────────────────────────────────────

  it('opens the port lazily on first send, not at construction', () => {
    createChatController({ onToken, onDone, onError });
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });

  it('opens a port named "chat" on first send', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hello', 'You are helpful.');
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'chat' });
  });

  it('does not open a second port if already connected', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('First', 'sys');
    ctrl.send('Second', 'sys');
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
  });

  it('pushes the user message into messages before sending', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hello', 'sys');
    expect(ctrl.messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('creates an empty assistant message placeholder when send is called', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hello', 'sys');
    expect(ctrl.messages[1]).toEqual({ role: 'assistant', content: '' });
  });

  it('sets state to streaming when send is called', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hello', 'sys');
    expect(ctrl.state).toBe<ChatState>('streaming');
  });

  it('posts CHAT_START over the port with messages and systemPrompt', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hello', 'Be concise.');
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'CHAT_START',
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'Be concise.',
    });
  });

  // ── token accumulation ─────────────────────────────────────────

  it('calls onToken and appends to the assistant message on token port messages', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');

    // Simulate the background sending a token
    const listener = (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (
      msg: PortMessage,
    ) => void;
    listener({ type: 'token', value: 'Hello' });

    expect(onToken).toHaveBeenCalledWith('Hello');
    expect(ctrl.messages[1].content).toBe('Hello');
  });

  it('accumulates multiple tokens into the assistant message', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');

    const listener = (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (
      msg: PortMessage,
    ) => void;
    listener({ type: 'token', value: 'Hel' });
    listener({ type: 'token', value: 'lo' });
    listener({ type: 'token', value: ' world' });

    expect(ctrl.messages[1].content).toBe('Hello world');
  });

  // ── done ───────────────────────────────────────────────────────

  it('calls onDone and sets state to idle when done port message arrives', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');

    const listener = (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (
      msg: PortMessage,
    ) => void;
    listener({ type: 'done' });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(ctrl.state).toBe<ChatState>('idle');
  });

  it('preserves accumulated tokens in messages after done', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');

    const listener = (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (
      msg: PortMessage,
    ) => void;
    listener({ type: 'token', value: 'All done' });
    listener({ type: 'done' });

    expect(ctrl.messages[1].content).toBe('All done');
  });

  // ── error ──────────────────────────────────────────────────────

  it('calls onError and sets state to idle on error port message', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');

    const listener = (mockPort.onMessage.addListener as Mock).mock.calls[0][0] as (
      msg: PortMessage,
    ) => void;
    listener({ type: 'error', error: 'connection refused' });

    expect(onError).toHaveBeenCalledWith('connection refused');
    expect(ctrl.state).toBe<ChatState>('idle');
  });

  // ── stop() ─────────────────────────────────────────────────────

  it('posts CHAT_STOP over the port when stop() is called', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');
    ctrl.stop();
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'CHAT_STOP' });
  });

  it('stop() is a no-op when not streaming (no port open)', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    expect(() => ctrl.stop()).not.toThrow();
  });

  // ── clear() ────────────────────────────────────────────────────

  it('empties messages and resets state to idle on clear()', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('Hi', 'sys');
    ctrl.clear();
    expect(ctrl.messages).toEqual([]);
    expect(ctrl.state).toBe<ChatState>('idle');
  });

  // ── port reconnect after disconnect ───────────────────────────

  it('re-opens the port on send() after a disconnect', () => {
    const ctrl = createChatController({ onToken, onDone, onError });
    ctrl.send('First', 'sys');

    // Simulate port disconnect (e.g. service worker restart)
    const disconnectListener = (mockPort.onDisconnect.addListener as Mock).mock
      .calls[0][0] as () => void;
    disconnectListener();

    // Second send should open a fresh port
    ctrl.send('Second', 'sys');
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(2);
  });
});

// ── Tool-call and tool-result port messages ──────────────────────────────────

describe('chat controller — tool-call and tool-result callbacks', () => {
  function makePortMock(): {
    port: {
      onMessage: { addListener: ReturnType<typeof vi.fn> };
      onDisconnect: { addListener: ReturnType<typeof vi.fn> };
      postMessage: ReturnType<typeof vi.fn>;
    };
    listeners: ((msg: unknown) => void)[];
  } {
    const listeners: ((msg: unknown) => void)[] = [];
    const port = {
      onMessage: { addListener: vi.fn((fn: (msg: unknown) => void) => listeners.push(fn)) },
      onDisconnect: { addListener: vi.fn() },
      postMessage: vi.fn(),
    };
    return { port, listeners };
  }

  it('calls onToolCall when a tool-call port message is received', () => {
    const onToolCall = vi.fn();
    const { port, listeners } = makePortMock();
    vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port), id: 'test-id' } });

    createChatController({ onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onToolCall });
    listeners[0]({ type: 'tool-call', toolName: 'wikipedia', args: { title: 'AI' } });
    expect(onToolCall).toHaveBeenCalledWith('wikipedia', { title: 'AI' });
  });

  it('calls onToolResult when a tool-result port message is received', () => {
    const onToolResult = vi.fn();
    const { port, listeners } = makePortMock();
    vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port), id: 'test-id' } });

    createChatController({ onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onToolResult });
    listeners[0]({ type: 'tool-result', toolName: 'wikipedia', result: 'TypeScript is...' });
    expect(onToolResult).toHaveBeenCalledWith('wikipedia', 'TypeScript is...');
  });
});
