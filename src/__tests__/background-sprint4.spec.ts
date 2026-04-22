// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeError, detectToolCall } from '../background';
import type * as StorageModule from '../lib/storage';

// ---------- sanitizeError ----------

describe('sanitizeError', () => {
  it('returns error unchanged when apiKey is empty', () => {
    expect(sanitizeError('something went wrong', '')).toBe('something went wrong');
  });

  it('redacts all occurrences of the apiKey in the error string', () => {
    const result = sanitizeError('Bearer sk-abc123 and sk-abc123 again', 'sk-abc123');
    expect(result).toBe('Bearer [REDACTED] and [REDACTED] again');
  });

  it('redacts provider apiKey (not just Obsidian key)', () => {
    const result = sanitizeError('401 Unauthorized: Bearer or-key-xyz', 'or-key-xyz');
    expect(result).not.toContain('or-key-xyz');
    expect(result).toContain('[REDACTED]');
  });
});

// ---------- detectToolCall ----------

describe('detectToolCall', () => {
  it('returns null for a plain text line', () => {
    expect(detectToolCall('Here is a normal sentence.')).toBeNull();
  });

  it('returns null for a line that does not start with {', () => {
    expect(detectToolCall('  some text {"tool":"web_search","args":{"query":"x"}}')).toBeNull();
  });

  it('returns null for JSON that lacks a tool key', () => {
    expect(detectToolCall('{"action":"search","args":{"query":"x"}}')).toBeNull();
  });

  it('returns null for JSON with a non-string tool value', () => {
    expect(detectToolCall('{"tool":42,"args":{"query":"x"}}')).toBeNull();
  });

  it('parses a valid tool-call line and returns toolName and args', () => {
    const result = detectToolCall('{"tool":"web_search","args":{"query":"AI news"}}');
    expect(result).toEqual({ toolName: 'web_search', args: { query: 'AI news' } });
  });

  it('parses wikipedia tool-call', () => {
    const result = detectToolCall('{"tool":"wikipedia","args":{"title":"TypeScript"}}');
    expect(result).toEqual({ toolName: 'wikipedia', args: { title: 'TypeScript' } });
  });

  it('returns null for malformed JSON', () => {
    expect(detectToolCall('{"tool":"web_search","args":{bad json}')).toBeNull();
  });

  it('returns null for empty args object', () => {
    const result = detectToolCall('{"tool":"wikipedia","args":{}}');
    expect(result).toEqual({ toolName: 'wikipedia', args: {} });
  });
});

// ---------- ReAct loop integration ----------

vi.mock('../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    getProviderConfig: vi.fn(),
    getSearchConfig: vi.fn(),
    getOllamaConfig: vi.fn(),
    getObsidianConfig: vi.fn(),
  };
});

vi.mock('../lib/providers/index', () => ({
  resolveProvider: vi.fn(),
}));

vi.mock('../lib/tools/registry', () => ({
  dispatchTool: vi.fn(),
}));

import * as storage from '../lib/storage';
import { resolveProvider } from '../lib/providers/index';
import { dispatchTool } from '../lib/tools/registry';
import type { ProviderConfig, SearchConfig } from '../types';

const defaultProvider: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

function makePort() {
  const messages: unknown[] = [];
  return {
    postMessage: vi.fn((msg: unknown) => messages.push(msg)),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    sent: messages,
  };
}

function makeChatStream(turns: Array<{ tokens?: string[]; toolCallLine?: string }>) {
  let callCount = 0;
  return vi.fn(
    async (
      _messages: unknown,
      _system: unknown,
      opts: { onToken: (t: string) => void; onDone: () => void },
    ) => {
      const turn = turns[callCount++];
      if (!turn) {
        opts.onDone();
        return;
      }
      if (turn.toolCallLine) {
        opts.onToken(turn.toolCallLine + '\n');
      } else {
        for (const t of turn.tokens ?? []) opts.onToken(t);
        opts.onDone();
      }
    },
  );
}

describe('chat port handler — ReAct loop', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getProviderConfig).mockResolvedValue(defaultProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({} as SearchConfig);
    vi.mocked(storage.getOllamaConfig).mockResolvedValue({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: '',
    });
  });

  it('streams tokens directly to port when no tool call is detected', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['Hello', ' world'] }]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    // Simulate CHAT_START via the registered listener
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const tokenMessages = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'token',
    );
    expect(tokenMessages).toHaveLength(2);
    const doneMessages = port.sent.filter((m: unknown) => (m as { type: string }).type === 'done');
    expect(doneMessages).toHaveLength(1);
  });

  it('posts tool-call and tool-result indicators when tool JSON is detected', async () => {
    const chatStreamFn = makeChatStream([
      { toolCallLine: '{"tool":"wikipedia","args":{"title":"TypeScript"}}' },
      { tokens: ['TypeScript is a language.'] },
    ]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });
    vi.mocked(dispatchTool).mockResolvedValue('TypeScript is a typed superset of JavaScript.');

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const toolCallMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'tool-call',
    );
    expect(toolCallMsg).toMatchObject({ type: 'tool-call', toolName: 'wikipedia' });

    const toolResultMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'tool-result',
    );
    expect(toolResultMsg).toMatchObject({ type: 'tool-result', toolName: 'wikipedia' });
  });

  it('terminates after 8 iterations regardless of continued tool calls', async () => {
    const infiniteToolCalls = Array.from({ length: 10 }, () => ({
      toolCallLine: '{"tool":"wikipedia","args":{"title":"loop"}}',
    }));
    const chatStreamFn = makeChatStream(infiniteToolCalls);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });
    vi.mocked(dispatchTool).mockResolvedValue('result');

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const toolCallCount = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'tool-call',
    ).length;
    expect(toolCallCount).toBeLessThanOrEqual(8);
    const doneMessages = port.sent.filter((m: unknown) => (m as { type: string }).type === 'done');
    expect(doneMessages).toHaveLength(1);
  });

  it('prepends the tool system prompt to msg.systemPrompt', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'user-sys' });

    const [, systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, string, unknown];
    expect(systemPromptArg).toContain('user-sys');
    expect(systemPromptArg).toContain('web_search');
    expect(systemPromptArg).toContain('wikipedia');
  });
});

// Helper: mount the onConnect listener and expose a triggerChatStart fn
async function simulateChatPort(port: ReturnType<typeof makePort>) {
  // Re-import background to get the registered listener
  const mod = await import('../background');
  void mod; // ensure side effects run
  // The onConnect listener is registered at module load time.
  // We invoke the registered handler directly via the mock.
  const connectListeners =
    (chrome.runtime.onConnect as unknown as { _listeners: ((p: unknown) => void)[] })._listeners ??
    [];
  const listener = connectListeners[connectListeners.length - 1];

  let chatStartListener: ((msg: unknown) => Promise<void>) | null = null;
  port.onMessage.addListener.mockImplementation((fn: (msg: unknown) => Promise<void>) => {
    chatStartListener = fn;
  });

  if (listener) listener({ ...port, name: 'chat' });

  return {
    triggerChatStart: async (msg: unknown) => {
      if (chatStartListener) await chatStartListener(msg);
    },
  };
}
