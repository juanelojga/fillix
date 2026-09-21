// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, PortMessage } from '../types';
import { getTavilyConfig } from '../lib/storage';

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
const mockTestModel = vi.fn();
const mockCheckTavilyKey = vi.fn();

vi.mock('../lib/ollama', () => ({
  chatStream: mockChatStream,
  testModel: mockTestModel,
  inferFieldValue: vi.fn(),
}));
vi.mock('../lib/legacy-migration', () => ({
  migrateLegacyProviderKeys: vi.fn(),
  removeRetiredSearchKey: vi.fn(),
  removeRetiredObsidianKeys: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  getOllamaConfig: vi
    .fn()
    .mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
  getChatConfig: vi.fn().mockResolvedValue({ systemPrompt: 'Be brief.' }),
  getModelList: vi.fn().mockResolvedValue([]),
  // Keyless by default: `chat-runner` reads this on every turn to decide whether to advertise
  // tavily_search, and the TEST_TAVILY case reads it to refuse before spending a request.
  getTavilyConfig: vi.fn().mockResolvedValue({ apiKey: '' }),
}));
vi.mock('../lib/tavily/search', () => ({
  checkTavilyKey: mockCheckTavilyKey,
}));

const messageListeners: ((
  msg: Message,
  sender: { id?: string },
  sendResponse: (r: unknown) => void,
) => void)[] = [];

vi.stubGlobal('chrome', {
  runtime: {
    onMessage: { addListener: vi.fn((cb) => messageListeners.push(cb)) },
    onConnect: {
      addListener: vi.fn((cb: (port: MockPort) => void) => connectListeners.push(cb)),
    },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
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

  it('calls chatStream with config, messages, and the resolved system prompt on CHAT_START', async () => {
    mockChatStream.mockResolvedValue(undefined);
    const port = makeMockPort('chat');
    fireConnect(port);

    port.onMessage._fire({
      type: 'CHAT_START',
      messages: [{ role: 'user', content: 'hi' }],
    });

    // Allow microtasks to flush
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(mockChatStream).toHaveBeenCalledOnce();
    const [cfg, msgs, sys] = mockChatStream.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(cfg).toMatchObject({ baseUrl: 'http://localhost:11434' });
    expect(msgs).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sys).toContain('Be brief.');
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
    await new Promise<void>((r) => setTimeout(r, 0));

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
    await new Promise<void>((r) => setTimeout(r, 0));

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
    await new Promise<void>((r) => setTimeout(r, 0));

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
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as AbortSignal).aborted).toBe(false);

    port.onMessage._fire({ type: 'CHAT_STOP' });
    await new Promise<void>((r) => setTimeout(r, 0));

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
    await new Promise<void>((r) => setTimeout(r, 0));

    port.onDisconnect._fire();
    await new Promise<void>((r) => setTimeout(r, 0));

    expect((capturedSignal as AbortSignal).aborted).toBe(true);
  });

  it('calls setPanelBehavior at startup so toolbar click opens the side panel', async () => {
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });
});

// --- TEST_MODEL: the manual model-list replacement for LIST_MODELS ---

describe('TEST_MODEL message type', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    messageListeners.length = 0;
    connectListeners = [];
    await loadBackground();
  });

  function send(msg: Message): Promise<unknown> {
    return new Promise((resolve) => {
      messageListeners[0](msg, {}, resolve);
    });
  }

  it('runs testModel against the requested model and returns its latency', async () => {
    mockTestModel.mockResolvedValue(412);

    const response = await send({ type: 'TEST_MODEL', model: 'qwen3:8b' });

    expect(mockTestModel).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
    });
    expect(response).toEqual({ ok: true, latencyMs: 412 });
  });

  it('returns the Ollama error text when the model does not run', async () => {
    mockTestModel.mockRejectedValue(new Error('model "nope" not found'));

    const response = await send({ type: 'TEST_MODEL', model: 'nope' });

    expect(response).toEqual({ ok: false, error: 'model "nope" not found' });
  });
});

describe('TEST_TAVILY message type', () => {
  const KEY = 'tvly-secret-key';

  beforeEach(async () => {
    vi.clearAllMocks();
    messageListeners.length = 0;
    connectListeners = [];
    await loadBackground();
    vi.mocked(getTavilyConfig).mockResolvedValue({ apiKey: KEY });
  });

  function send(msg: Message): Promise<unknown> {
    return new Promise((resolve) => {
      messageListeners[0](msg, {}, resolve);
    });
  }

  it('probes the stored key and returns its status', async () => {
    mockCheckTavilyKey.mockResolvedValue({ latencyMs: 312, used: 150, limit: 1000 });

    const response = await send({ type: 'TEST_TAVILY' });

    const [key, signal] = mockCheckTavilyKey.mock.calls[0] as [string, AbortSignal];
    expect(key).toBe(KEY);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(response).toEqual({ ok: true, tavily: { latencyMs: 312, used: 150, limit: 1000 } });
  });

  // The PROFILE_INDEX pattern: a precondition is a throw, and the message names the tab that
  // fixes it rather than leaving the panel to guess.
  it('refuses without a key and names the Settings tab', async () => {
    vi.mocked(getTavilyConfig).mockResolvedValue({ apiKey: '' });

    const response = await send({ type: 'TEST_TAVILY' });

    expect(response).toEqual({
      ok: false,
      error: 'No Tavily API key saved — paste one in the Settings tab.',
    });
    expect(mockCheckTavilyKey).not.toHaveBeenCalled();
  });

  it('returns the failure text so the panel can diagnose it', async () => {
    mockCheckTavilyKey.mockRejectedValue(
      new Error('Tavily /usage returned 401: Unauthorized: missing or invalid API key.'),
    );

    const response = await send({ type: 'TEST_TAVILY' });

    expect(response).toEqual({
      ok: false,
      error: 'Tavily /usage returned 401: Unauthorized: missing or invalid API key.',
    });
  });

  /**
   * `sanitizeError` has been called with zero keys since the last credential was removed from the
   * product. This is the first thing to feed it again: Tavily's own error text is the one string
   * in the system that could echo a secret onto the screen.
   */
  it('redacts the key out of an error that echoed it back', async () => {
    mockCheckTavilyKey.mockRejectedValue(new Error(`Tavily /usage returned 401: bad token ${KEY}`));

    const response = await send({ type: 'TEST_TAVILY' });

    const { error } = response as { error: string };
    expect(error).not.toContain(KEY);
    expect(error).toContain('[REDACTED]');
  });
});
