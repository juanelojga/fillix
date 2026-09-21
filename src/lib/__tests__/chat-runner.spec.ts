import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectToolCall, handleChatPort } from '../chat-runner';
import type * as StorageModule from '../storage';
import type * as OllamaModule from '../ollama';

// ---------- detectToolCall ----------

describe('detectToolCall', () => {
  it('returns null for a plain text line', () => {
    expect(detectToolCall('Here is a normal sentence.')).toBeNull();
  });

  it('returns null for a line that does not start with {', () => {
    expect(detectToolCall('  some text {"tool":"news_feed","args":{"topic":"x"}}')).toBeNull();
  });

  it('returns null for JSON that lacks a tool key', () => {
    expect(detectToolCall('{"action":"search","args":{"query":"x"}}')).toBeNull();
  });

  it('returns null for JSON with a non-string tool value', () => {
    expect(detectToolCall('{"tool":42,"args":{"query":"x"}}')).toBeNull();
  });

  it('parses a valid tool-call line and returns toolName and args', () => {
    const result = detectToolCall('{"tool":"news_feed","args":{"topic":"AI news"}}');
    expect(result).toEqual({ toolName: 'news_feed', args: { topic: 'AI news' } });
  });

  it('parses wikipedia tool-call', () => {
    const result = detectToolCall('{"tool":"wikipedia","args":{"title":"TypeScript"}}');
    expect(result).toEqual({ toolName: 'wikipedia', args: { title: 'TypeScript' } });
  });

  it('returns null for malformed JSON', () => {
    expect(detectToolCall('{"tool":"news_feed","args":{bad json}')).toBeNull();
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
    getOllamaConfig: vi.fn(),
    getChatConfig: vi.fn(),
    getTavilyConfig: vi.fn(),
  };
});

vi.mock('../ollama', async (importOriginal) => {
  const actual = await importOriginal<typeof OllamaModule>();
  return { ...actual, chatStream: vi.fn() };
});

vi.mock('../tools/registry', () => ({
  dispatchTool: vi.fn(),
}));

import * as storage from '../storage';
import { chatStream } from '../ollama';
import { dispatchTool } from '../tools/registry';
import { DEFAULT_SYSTEM_PROMPT } from '../system-prompt';
import type { OllamaConfig } from '../../types';

const defaultConfig: OllamaConfig = {
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
      _config: unknown,
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
    vi.mocked(storage.getOllamaConfig).mockResolvedValue(defaultConfig);
    // Keyless unless a test says otherwise: chat-runner reads this on every turn to decide
    // whether tavily_search is advertised at all.
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: '' });
    // '' = no override, so the packaged prompt is what reaches the model.
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: '' });
  });

  it('streams tokens directly to port when no tool call is detected', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['Hello', ' world'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

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
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    vi.mocked(dispatchTool).mockResolvedValue('TypeScript is a typed superset of JavaScript.');

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const toolCallMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'tool-call',
    );
    expect(toolCallMsg).toMatchObject({ type: 'tool-call', toolName: 'wikipedia' });

    const toolResultMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'tool-result',
    );
    expect(toolResultMsg).toMatchObject({ type: 'tool-result', toolName: 'wikipedia' });

    // toHaveBeenCalledWith is exact on arity — a resurrected searchConfig param fails here.
    expect(dispatchTool).toHaveBeenCalledWith('wikipedia', { title: 'TypeScript' });
  });

  it('terminates after 8 iterations regardless of continued tool calls', async () => {
    const infiniteToolCalls = Array.from({ length: 10 }, () => ({
      toolCallLine: '{"tool":"wikipedia","args":{"title":"loop"}}',
    }));
    const chatStreamFn = makeChatStream(infiniteToolCalls);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    vi.mocked(dispatchTool).mockResolvedValue('result');

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const toolCallCount = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'tool-call',
    ).length;
    expect(toolCallCount).toBeLessThanOrEqual(8);
    const doneMessages = port.sent.filter((m: unknown) => (m as { type: string }).type === 'done');
    expect(doneMessages).toHaveLength(1);
  });

  it('prepends the tool system prompt to the packaged default', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const [, , systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPromptArg).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(systemPromptArg).toContain('wikipedia');
    // Tool instructions must lead, or the model answers before it sees them.
    expect(systemPromptArg.indexOf('wikipedia')).toBeLessThan(
      systemPromptArg.indexOf(DEFAULT_SYSTEM_PROMPT),
    );
    // The retired tool must not be advertised back to the model.
    expect(systemPromptArg).not.toContain('web_search');
  });

  // Built per turn rather than once at module load, so pasting a key into Settings takes effect
  // on the next message instead of the next browser restart.
  it('withholds tavily_search from the prompt when no Tavily key is stored', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const { triggerChatStart } = await simulateChatPort(makePort());
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const [, , systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPromptArg).not.toContain('tavily_search');
    expect(systemPromptArg).toContain('wikipedia');
  });

  it('advertises tavily_search once a Tavily key is stored', async () => {
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: 'tvly-abc' });
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const { triggerChatStart } = await simulateChatPort(makePort());
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const [, , systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPromptArg).toContain('{"tool":"tavily_search","args":{"query":');
    // The key itself has no business in a prompt.
    expect(systemPromptArg).not.toContain('tvly-abc');
  });

  it('runs a profile_search round trip and feeds the sections back as context', async () => {
    const chatStreamFn = makeChatStream([
      { toolCallLine: '{"tool":"profile_search","args":{"query":"Python experience"}}' },
      { tokens: ['You have eight years of Python.'] },
    ]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    vi.mocked(dispatchTool).mockResolvedValue('## Python\n\nEight years of Python.');

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    expect(dispatchTool).toHaveBeenCalledWith('profile_search', { query: 'Python experience' });
    expect(port.sent).toContainEqual({
      type: 'tool-result',
      toolName: 'profile_search',
      result: '## Python\n\nEight years of Python.',
    });

    // The retrieved section has to reach the *second* stream, or the model answers the
    // question it already asked the tool about from memory anyway.
    const [, secondMessages] = chatStreamFn.mock.calls[1] as [
      unknown,
      { role: string; content: string }[],
      unknown,
      unknown,
    ];
    expect(secondMessages.at(-1)?.content).toContain('Eight years of Python.');
  });

  it('advertises the local profile tools and forbids answering about the user from memory', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const [, , systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPromptArg).toContain('profile_search');
    expect(systemPromptArg).toContain('meeting_availability');
    expect(systemPromptArg).toContain('never answer those from memory');
  });

  it('uses the stored override in place of the packaged default', async () => {
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: 'Answer only in haiku.' });
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const [, , systemPromptArg] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPromptArg).toContain('Answer only in haiku.');
    expect(systemPromptArg).not.toContain(DEFAULT_SYSTEM_PROMPT);
    // Tools survive an override — they are not the user's to switch off.
    expect(systemPromptArg).toContain('wikipedia');
  });
});

describe('chat port handler — thinking tokens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getOllamaConfig).mockResolvedValue(defaultConfig);
    // Keyless unless a test says otherwise: chat-runner reads this on every turn to decide
    // whether tavily_search is advertised at all.
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: '' });
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: '' });
  });

  it('forwards thinking tokens to port as type:thinking messages', async () => {
    const chatStreamFn = makeChatStream([
      { thinkingTokens: ['step 1', ' step 2'], tokens: ['Answer'] },
    ]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

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
    vi.mocked(storage.getOllamaConfig).mockResolvedValue(defaultConfig);
    // Keyless unless a test says otherwise: chat-runner reads this on every turn to decide
    // whether tavily_search is advertised at all.
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: '' });
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: '' });
  });

  it('posts type:error to port when chatStream calls onError', async () => {
    const chatStreamFn = makeChatStream([{ error: 'connection refused' }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    const errorMessages = port.sent.filter(
      (m: unknown) => (m as { type: string }).type === 'error',
    );
    expect(errorMessages).toHaveLength(1);
    expect(errorMessages[0]).toMatchObject({ type: 'error', error: 'connection refused' });
  });

  // Without this the side panel keeps streaming forever: no tokens, no error,
  // and a stop button that has nothing left to cancel.
  it('posts type:error when reading the stored config throws', async () => {
    vi.mocked(storage.getOllamaConfig).mockRejectedValue(new Error('storage unavailable'));

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    expect(port.sent).toContainEqual({ type: 'error', error: 'storage unavailable' });
  });

  it('posts type:error when a tool dispatch rejects', async () => {
    vi.mocked(chatStream).mockImplementation(
      makeChatStream([{ toolCallLine: '{"tool":"wikipedia","args":{"title":"x"}}' }]),
    );
    vi.mocked(dispatchTool).mockRejectedValue(new Error('fetch failed'));

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({ type: 'CHAT_START', messages: [] });

    expect(port.sent).toContainEqual({ type: 'error', error: 'fetch failed' });
  });

  it('does not throw when the side panel closed and posting rejects', async () => {
    vi.mocked(chatStream).mockImplementation(makeChatStream([{ tokens: ['hi'] }]));

    const port = makePort();
    port.postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    const { triggerChatStart } = await simulateChatPort(port);

    await expect(triggerChatStart({ type: 'CHAT_START', messages: [] })).resolves.toBeUndefined();
  });
});

describe('chat port handler — CHAT_STOP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getOllamaConfig).mockResolvedValue(defaultConfig);
    // Keyless unless a test says otherwise: chat-runner reads this on every turn to decide
    // whether tavily_search is advertised at all.
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: '' });
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: '' });
  });

  it('CHAT_STOP message posts done immediately', async () => {
    vi.mocked(chatStream).mockImplementation(async () => {});

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
    vi.mocked(storage.getOllamaConfig).mockResolvedValue(defaultConfig);
    // Keyless unless a test says otherwise: chat-runner reads this on every turn to decide
    // whether tavily_search is advertised at all.
    vi.mocked(storage.getTavilyConfig).mockResolvedValue({ apiKey: '' });
    vi.mocked(storage.getChatConfig).mockResolvedValue({ systemPrompt: '' });
  });

  it('msg.model overrides the stored model when provided', async () => {
    const chatStreamFn = makeChatStream([{ tokens: ['ok'] }]);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);

    const port = makePort();
    const { triggerChatStart } = await simulateChatPort(port);
    await triggerChatStart({
      type: 'CHAT_START',
      messages: [],
      model: 'gpt-4',
    });

    const [configArg] = chatStreamFn.mock.calls[0] as [OllamaConfig];
    expect(configArg.model).toBe('gpt-4');
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
