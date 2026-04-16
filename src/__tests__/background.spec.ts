// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, PortMessage } from '../types';

// --- Chrome API stubs ---

type MessageListener = (msg: Message) => void;
type DisconnectListener = () => void;

interface MockPort {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  onMessage: { addListener: ReturnType<typeof vi.fn>; _fire: (msg: Message) => void };
  onDisconnect: { addListener: ReturnType<typeof vi.fn>; _fire: () => void };
}

function makeMockPort(name: string): MockPort {
  const messageListeners: MessageListener[] = [];
  const disconnectListeners: DisconnectListener[] = [];

  return {
    name,
    postMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn((cb: MessageListener) => messageListeners.push(cb)),
      _fire: (msg: Message) => messageListeners.forEach((cb) => cb(msg)),
    },
    onDisconnect: {
      addListener: vi.fn((cb: DisconnectListener) => disconnectListeners.push(cb)),
      _fire: () => disconnectListeners.forEach((cb) => cb()),
    },
  };
}

let connectListeners: ((port: MockPort) => void)[] = [];

const mockChatStream = vi.fn();
const mockGetOllamaConfig = vi.fn().mockResolvedValue({
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
});

vi.mock('../lib/ollama', () => ({ chatStream: mockChatStream, listModels: vi.fn() }));
vi.mock('../lib/storage', () => ({
  getOllamaConfig: mockGetOllamaConfig,
  getChatConfig: vi.fn(),
}));

vi.stubGlobal('chrome', {
  runtime: {
    onMessage: { addListener: vi.fn() },
    onConnect: {
      addListener: vi.fn((cb: (port: MockPort) => void) => connectListeners.push(cb)),
    },
  },
  sidePanel: {
    setPanelBehavior: vi.fn(),
  },
});

async function loadBackground() {
  vi.resetModules();
  connectListeners = [];
  await import('../background');
}

function fireConnect(port: MockPort) {
  connectListeners.forEach((cb) => cb(port));
}

describe('background onConnect handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    connectListeners = [];
    await loadBackground();
  });

  it('ignores ports not named "chat"', () => {
    const port = makeMockPort('other');
    fireConnect(port);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
  });

  it('registers onMessage and onDisconnect listeners for the "chat" port', () => {
    const port = makeMockPort('chat');
    fireConnect(port);
    expect(port.onMessage.addListener).toHaveBeenCalledOnce();
    expect(port.onDisconnect.addListener).toHaveBeenCalledOnce();
  });

  it('calls chatStream with config, messages, and systemPrompt on CHAT_START', async () => {
    mockChatStream.mockResolvedValue(undefined);
    const port = makeMockPort('chat');
    fireConnect(port);

    port.onMessage._fire({
      type: 'CHAT_START',
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'Be brief.',
    });

    // Allow microtasks to flush
    await vi.runAllMicrotasksAsync();

    expect(mockChatStream).toHaveBeenCalledOnce();
    const [cfg, msgs, sys] = mockChatStream.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(cfg).toMatchObject({ baseUrl: 'http://localhost:11434' });
    expect(msgs).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sys).toBe('Be brief.');
  });

  it('forwards token PortMessages to the port', async () => {
    mockChatStream.mockImplementation(
      async (
        _cfg: unknown,
        _msgs: unknown,
        _sys: unknown,
        opts: { onToken: (t: string) => void },
      ) => {
        opts.onToken('hello');
      },
    );

    const port = makeMockPort('chat');
    fireConnect(port);
    port.onMessage._fire({
      type: 'CHAT_START',
      messages: [],
      systemPrompt: '',
    });
    await vi.runAllMicrotasksAsync();

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'token',
      value: 'hello',
    } satisfies PortMessage);
  });

  it('forwards done PortMessage to the port', async () => {
    mockChatStream.mockImplementation(
      async (_cfg: unknown, _msgs: unknown, _sys: unknown, opts: { onDone: () => void }) => {
        opts.onDone();
      },
    );

    const port = makeMockPort('chat');
    fireConnect(port);
    port.onMessage._fire({ type: 'CHAT_START', messages: [], systemPrompt: '' });
    await vi.runAllMicrotasksAsync();

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' } satisfies PortMessage);
  });

  it('forwards error PortMessage to the port', async () => {
    mockChatStream.mockImplementation(
      async (
        _cfg: unknown,
        _msgs: unknown,
        _sys: unknown,
        opts: { onError: (e: string) => void },
      ) => {
        opts.onError('timeout');
      },
    );

    const port = makeMockPort('chat');
    fireConnect(port);
    port.onMessage._fire({ type: 'CHAT_START', messages: [], systemPrompt: '' });
    await vi.runAllMicrotasksAsync();

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: 'timeout',
    } satisfies PortMessage);
  });

  it('aborts the stream on CHAT_STOP', async () => {
    let capturedSignal: AbortSignal | null = null;
    mockChatStream.mockImplementation(
      async (_cfg: unknown, _msgs: unknown, _sys: unknown, opts: { signal: AbortSignal }) => {
        capturedSignal = opts.signal;
        // Simulate a long-running stream
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      },
    );

    const port = makeMockPort('chat');
    fireConnect(port);
    port.onMessage._fire({ type: 'CHAT_START', messages: [], systemPrompt: '' });
    await vi.runAllMicrotasksAsync();

    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as AbortSignal).aborted).toBe(false);

    port.onMessage._fire({ type: 'CHAT_STOP' });
    await vi.runAllMicrotasksAsync();

    expect((capturedSignal as AbortSignal).aborted).toBe(true);
  });

  it('aborts the stream when the port disconnects', async () => {
    let capturedSignal: AbortSignal | null = null;
    mockChatStream.mockImplementation(
      async (_cfg: unknown, _msgs: unknown, _sys: unknown, opts: { signal: AbortSignal }) => {
        capturedSignal = opts.signal;
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      },
    );

    const port = makeMockPort('chat');
    fireConnect(port);
    port.onMessage._fire({ type: 'CHAT_START', messages: [], systemPrompt: '' });
    await vi.runAllMicrotasksAsync();

    port.onDisconnect._fire();
    await vi.runAllMicrotasksAsync();

    expect((capturedSignal as AbortSignal).aborted).toBe(true);
  });

  it('calls setPanelBehavior at startup so toolbar click opens the side panel', async () => {
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });
});
