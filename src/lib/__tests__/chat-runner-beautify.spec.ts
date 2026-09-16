// Tests for Task 1.2: BEAUTIFY handler in chat-runner.ts
// These tests will FAIL at runtime until Gate 4 adds the BEAUTIFY case.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatPort } from '../chat-runner';
import type * as StorageModule from '../storage';
import type * as OllamaModule from '../ollama';

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    getSearchConfig: vi.fn(),
    getOllamaConfig: vi.fn(),
    getObsidianConfig: vi.fn(),
  };
});

vi.mock('../ollama', async (importOriginal) => {
  const actual = await importOriginal<typeof OllamaModule>();
  return { ...actual, chatStream: vi.fn() };
});

import * as storage from '../storage';
import { chatStream } from '../ollama';
import type { OllamaConfig } from '../../types';

const baseConfig: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

function makePort() {
  const sent: unknown[] = [];
  const disconnectHandlers: Array<() => void> = [];
  return {
    postMessage: vi.fn((m: unknown) => sent.push(m)),
    onMessage: { addListener: vi.fn() },
    onDisconnect: {
      addListener: vi.fn((fn: () => void) => disconnectHandlers.push(fn)),
      removeListener: vi.fn((fn: () => void) => {
        const i = disconnectHandlers.indexOf(fn);
        if (i !== -1) disconnectHandlers.splice(i, 1);
      }),
      _fire: () => [...disconnectHandlers].forEach((fn) => fn()),
    },
    sent,
  };
}

function setup(port: ReturnType<typeof makePort>) {
  let listener: ((msg: unknown) => Promise<void>) | null = null;
  port.onMessage.addListener.mockImplementation((fn: (msg: unknown) => Promise<void>) => {
    listener = fn;
  });
  handleChatPort(port as unknown as chrome.runtime.Port);
  return {
    trigger: async (msg: unknown) => {
      if (listener) await listener(msg);
    },
  };
}

function makeStream(tokens?: string[], error?: string) {
  return vi.fn(
    async (
      _config: unknown,
      _msgs: unknown,
      _sys: unknown,
      opts: {
        signal?: AbortSignal;
        onToken: (t: string) => void;
        onDone: () => void;
        onError?: (e: string) => void;
      },
    ) => {
      if (error) {
        opts.onError?.(error);
        return;
      }
      for (const t of tokens ?? []) opts.onToken(t);
      opts.onDone();
    },
  );
}

describe('BEAUTIFY handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: '',
    });
  });

  it('posts { type:"beautified", content } accumulating all streamed tokens on success', async () => {
    vi.mocked(chatStream).mockImplementation(makeStream(['Clean', ' text']));
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', config: baseConfig });

    expect(port.sent).toContainEqual({ type: 'beautified', content: 'Clean text' });
  });

  it('uses the config from the BEAUTIFY message, not the one in storage', async () => {
    const customCfg: OllamaConfig = { baseUrl: 'http://custom:11434', model: 'qwen3:8b' };
    const chatStreamFn = makeStream(['ok']);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', config: customCfg });

    const [configArg] = chatStreamFn.mock.calls[0] as [OllamaConfig];
    expect(configArg).toMatchObject(customCfg);
  });

  it('passes the raw content as a single user message to chatStream', async () => {
    const chatStreamFn = makeStream(['formatted']);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'original text', config: baseConfig });

    const [, messagesArg] = chatStreamFn.mock.calls[0] as [
      unknown,
      Array<{ role: string; content: string }>,
      unknown,
      unknown,
    ];
    expect(messagesArg).toHaveLength(1);
    expect(messagesArg[0]).toMatchObject({ role: 'user', content: 'original text' });
  });

  it('uses a non-empty DEFAULT_BEAUTIFIER_PROMPT as the system prompt', async () => {
    const chatStreamFn = makeStream(['ok']);
    vi.mocked(chatStream).mockImplementation(chatStreamFn);
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', config: baseConfig });

    const [, , systemPrompt] = chatStreamFn.mock.calls[0] as [unknown, unknown, string, unknown];
    expect(systemPrompt.trim().length).toBeGreaterThan(0);
  });

  it('posts { type:"beautify-error", reason } when chatStream fires onError', async () => {
    vi.mocked(chatStream).mockImplementation(makeStream(undefined, 'timeout'));
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', config: baseConfig });

    const errMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'beautify-error',
    );
    expect(errMsg).toBeDefined();
    expect((errMsg as { reason: string }).reason).toBeTruthy();
  });

  it('removes the onDisconnect listener in the finally block to prevent listener leaks', async () => {
    vi.mocked(chatStream).mockImplementation(makeStream(['done']));
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'text', config: baseConfig });

    expect(port.onDisconnect.removeListener).toHaveBeenCalledOnce();
  });

  it('does not throw an unhandled rejection when port disconnects mid-beautify', async () => {
    const abortAwareStream = vi.fn(
      async (
        _config: unknown,
        _msgs: unknown,
        _sys: unknown,
        opts: {
          signal?: AbortSignal;
          onToken: (t: string) => void;
          onDone: () => void;
          onError?: (e: string) => void;
        },
      ) => {
        if (opts.signal?.aborted) {
          opts.onError?.('AbortError');
          return;
        }
        opts.onDone();
      },
    );
    vi.mocked(chatStream).mockImplementation(abortAwareStream);

    const port = makePort();
    const { trigger } = setup(port);

    port.onDisconnect._fire();
    await expect(
      trigger({ type: 'BEAUTIFY', content: 'text', config: baseConfig }),
    ).resolves.toBeUndefined();
  });
});
