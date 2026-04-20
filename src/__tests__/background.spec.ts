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

// --- Sprint 2: Message contract specs ---
// These verify that the new Message and MessageResponse union variants
// from Tasks 2.2 and 2.4 compile and carry the correct shapes.

import type { MessageResponse, WorkflowDefinition, FieldSnapshot, FieldFill } from '../types';

describe('OBSIDIAN_WRITE message type', () => {
  it('requires path and content string fields', () => {
    const msg: Message = {
      type: 'OBSIDIAN_WRITE',
      path: 'fillix-logs/2026-04-20.md',
      content: '# Log',
    };
    expect(msg.type).toBe('OBSIDIAN_WRITE');
    expect((msg as Extract<Message, { type: 'OBSIDIAN_WRITE' }>).path).toBe(
      'fillix-logs/2026-04-20.md',
    );
    expect((msg as Extract<Message, { type: 'OBSIDIAN_WRITE' }>).content).toBe('# Log');
  });
});

describe('OBSIDIAN_APPEND message type', () => {
  it('requires path and content string fields', () => {
    const msg: Message = { type: 'OBSIDIAN_APPEND', path: 'log.md', content: '## Entry' };
    expect(msg.type).toBe('OBSIDIAN_APPEND');
    expect((msg as Extract<Message, { type: 'OBSIDIAN_APPEND' }>).path).toBe('log.md');
  });
});

describe('WORKFLOWS_REFRESH message type', () => {
  it('requires only type — no other fields', () => {
    const msg: Message = { type: 'WORKFLOWS_REFRESH' };
    expect(msg.type).toBe('WORKFLOWS_REFRESH');
  });
});

describe('WORKFLOWS_LIST message type', () => {
  it('requires only type — no other fields', () => {
    const msg: Message = { type: 'WORKFLOWS_LIST' };
    expect(msg.type).toBe('WORKFLOWS_LIST');
  });
});

describe('MessageResponse with workflows variant', () => {
  it('allows ok: true with a workflows array', () => {
    const wf: WorkflowDefinition = {
      id: 'workflows/test.md',
      name: 'Test',
      taskType: 'form',
      tone: 'professional',
      requiredProfileFields: [],
      review: true,
      logFullOutput: true,
      autoApply: false,
      systemPrompt: 'Fill.',
    };
    const response: MessageResponse = { ok: true, workflows: [wf] };
    expect(response.ok).toBe(true);
    if (response.ok && 'workflows' in response) {
      expect(response.workflows).toHaveLength(1);
      expect(response.workflows[0].name).toBe('Test');
    }
  });

  it('OBSIDIAN_WRITE/APPEND success response is { ok: true }', () => {
    const response: MessageResponse = { ok: true };
    expect(response.ok).toBe(true);
  });

  it('error response shape is { ok: false, error: string }', () => {
    const response: MessageResponse = { ok: false, error: 'Obsidian unreachable' };
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(typeof response.error).toBe('string');
    }
  });
});

// --- Sprint 3: Message contract specs ---
// Verify DETECT_FIELDS and APPLY_FIELDS union variants (Tasks 3.3) compile correctly.

describe('DETECT_FIELDS message type (with tabId)', () => {
  it('requires type and tabId', () => {
    const msg: Message = { type: 'DETECT_FIELDS', tabId: 42 };
    expect(msg.type).toBe('DETECT_FIELDS');
    expect((msg as Extract<Message, { type: 'DETECT_FIELDS' }>).tabId).toBe(42);
  });
});

describe('APPLY_FIELDS message type (with tabId)', () => {
  it('requires type, tabId, and fieldMap', () => {
    const fieldMap: FieldFill[] = [
      { fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'a@b.com' },
    ];
    const msg: Message = { type: 'APPLY_FIELDS', tabId: 42, fieldMap };
    expect(msg.type).toBe('APPLY_FIELDS');
    expect((msg as Extract<Message, { type: 'APPLY_FIELDS' }>).fieldMap).toHaveLength(1);
  });
});

describe('MessageResponse with fields variant', () => {
  it('allows ok: true with a FieldSnapshot array', () => {
    const fields: FieldSnapshot[] = [{ currentValue: 'foo', id: 'email', type: 'email' }];
    const response: MessageResponse = { ok: true, fields };
    expect(response.ok).toBe(true);
    if (response.ok && 'fields' in response) {
      expect(response.fields).toHaveLength(1);
    }
  });
});

describe('MessageResponse with applied variant', () => {
  it('allows ok: true with an applied count', () => {
    const response: MessageResponse = { ok: true, applied: 3 };
    expect(response.ok).toBe(true);
    if (response.ok && 'applied' in response) {
      expect(response.applied).toBe(3);
    }
  });
});
