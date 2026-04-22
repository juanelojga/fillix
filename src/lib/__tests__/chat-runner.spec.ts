import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectToolCall, handleChatPort } from '../chat-runner';
import type * as StorageModule from '../storage';

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

  it('returns empty args object when args is omitted', () => {
    const result = detectToolCall('{"tool":"wikipedia","args":{}}');
    expect(result).toEqual({ toolName: 'wikipedia', args: {} });
  });
});

// ---------- ReAct loop integration ----------

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    getProviderConfig: vi.fn(),
    getSearchConfig: vi.fn(),
    getOllamaConfig: vi.fn(),
    getObsidianConfig: vi.fn(),
  };
});

vi.mock('../providers/index', () => ({
  resolveProvider: vi.fn(),
}));

vi.mock('../tools/registry', () => ({
  dispatchTool: vi.fn(),
}));

import * as storage from '../storage';
import { resolveProvider } from '../providers/index';
import { dispatchTool } from '../tools/registry';
import type { ProviderConfig, SearchConfig } from '../../types';

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

type Turn = {
  tokens?: string[];
  toolCallLine?: string;
  thinkingTokens?: string[];
  error?: string;
};

function makeChatStream(turns: Turn[]) {
  let callCount = 0;
  return vi.fn(
    async (
      _messages: unknown,
      _system: unknown,
      opts: {
        onToken: (t: string) => void;
        onDone: () => void;
        onThinking?: (t: string) => void;
        onError?: (e: string) => void;
      },
    ) => {
      const turn = turns[callCount++];
      if (!turn) {
        opts.onDone();
        return;
      }
      if (turn.error) {
        opts.onError?.(turn.error);
        return;
      }
      for (const t of turn.thinkingTokens ?? []) opts.onThinking?.(t);
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

describe('chat port handler — thinking tokens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getProviderConfig).mockResolvedValue(defaultProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({} as SearchConfig);
  });

  it('forwards thinking tokens to port as type:thinking messages', async () => {
    const chatStreamFn = makeChatStream([
      { thinkingTokens: ['step 1', ' step 2'], tokens: ['Answer'] },
    ]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const thinkingMessages = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'thinking',
    );
    expect(thinkingMessages).toHaveLength(2);
    expect(thinkingMessages[0]).toMatchObject({ type: 'thinking', value: 'step 1' });
    expect(thinkingMessages[1]).toMatchObject({ type: 'thinking', value: ' step 2' });
  });
});

describe('chat port handler — error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getProviderConfig).mockResolvedValue(defaultProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({} as SearchConfig);
  });

  it('posts type:error to port when chatStream calls onError', async () => {
    const chatStreamFn = makeChatStream([{ error: 'connection refused' }]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const errorMessages = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'error',
    );
    expect(errorMessages).toHaveLength(1);
    expect(errorMessages[0]).toMatchObject({ type: 'error', error: 'connection refused' });
  });

  it('redacts API key from error message', async () => {
    const apiKey = 'sk-secret-key-12345';
    vi.mocked(storage.getProviderConfig).mockResolvedValue({
      ...defaultProvider,
      apiKey,
    });
    const chatStreamFn = makeChatStream([{ error: `Auth failed: ${apiKey} is invalid` }]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [], systemPrompt: 'sys' });

    const errorMsg = port.sent.find((m: unknown) => (m as { type: string }).type === 'error') as
      | { type: string; error: string }
      | undefined;
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.error).toContain('[REDACTED]');
    expect(errorMsg!.error).not.toContain(apiKey);
  });
});

describe('chat port handler — CHAT_STOP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getProviderConfig).mockResolvedValue(defaultProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({} as SearchConfig);
  });

  it('CHAT_STOP message posts done immediately', async () => {
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: vi.fn(async () => {}),
      listModels: vi.fn(),
    });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_STOP' });

    const doneMessages = port.sent.filter((m: unknown) => (m as { type: string }).type === 'done');
    expect(doneMessages).toHaveLength(1);
  });
});

describe('chat port handler — model override', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getProviderConfig).mockResolvedValue(defaultProvider);
    vi.mocked(storage.getSearchConfig).mockResolvedValue({} as SearchConfig);
  });

  it('msg.model overrides providerConfig.model when provided', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({
      type: 'CHAT_START',
      messages: [],
      systemPrompt: 'sys',
      model: 'gpt-4',
    });

    const resolveCall = vi.mocked(resolveProvider).mock.calls[0][0];
    expect(resolveCall.model).toBe('gpt-4');
  });
});

function simulateChatPort(port: ReturnType<typeof makePort>) {
  let chatStartListener: ((msg: unknown) => Promise<void>) | null = null;
  port.onMessage.addListener.mockImplementation((fn: (msg: unknown) => Promise<void>) => {
    chatStartListener = fn;
  });

  handleChatPort(port as unknown as chrome.runtime.Port);

  return {
    triggerChatStart: async (msg: unknown) => {
      if (chatStartListener) await chatStartListener(msg);
    },
  };
}
