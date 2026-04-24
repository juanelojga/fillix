// Tests for Task 1.2: BEAUTIFY handler in chat-runner.ts
// These tests will FAIL at runtime until Gate 4 adds the BEAUTIFY case.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatPort } from '../chat-runner';
import type * as StorageModule from '../storage';

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

import * as storage from '../storage';
import { resolveProvider } from '../providers/index';
import type { ProviderConfig } from '../../types';

const baseProvider: ProviderConfig = {
  provider: 'ollama',
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
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: makeStream(['Clean', ' text']),
      listModels: vi.fn(),
    });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    expect(port.sent).toContainEqual({ type: 'beautified', content: 'Clean text' });
  });

  it('calls resolveProvider with the providerConfig from the BEAUTIFY message, not from storage', async () => {
    const customCfg: ProviderConfig = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      apiKey: 'sk-x',
    };
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: makeStream(['ok']),
      listModels: vi.fn(),
    });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: customCfg });

    expect(vi.mocked(resolveProvider).mock.calls[0][0]).toMatchObject(customCfg);
  });

  it('passes the raw content as a single user message to chatStream', async () => {
    const chatStreamFn = makeStream(['formatted']);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'original text', providerConfig: baseProvider });

    const [messagesArg] = chatStreamFn.mock.calls[0] as [
      Array<{ role: string; content: string }>,
      unknown,
      unknown,
    ];
    expect(messagesArg).toHaveLength(1);
    expect(messagesArg[0]).toMatchObject({ role: 'user', content: 'original text' });
  });

  it('uses a non-empty DEFAULT_BEAUTIFIER_PROMPT as the system prompt', async () => {
    const chatStreamFn = makeStream(['ok']);
    vi.mocked(resolveProvider).mockReturnValue({ chatStream: chatStreamFn, listModels: vi.fn() });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    const [, systemPrompt] = chatStreamFn.mock.calls[0] as [unknown, string, unknown];
    expect(systemPrompt.trim().length).toBeGreaterThan(0);
  });

  it('posts { type:"beautify-error", reason } when chatStream fires onError', async () => {
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: makeStream(undefined, 'timeout'),
      listModels: vi.fn(),
    });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    const errMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'beautify-error',
    );
    expect(errMsg).toBeDefined();
    expect((errMsg as { reason: string }).reason).toBeTruthy();
  });

  it('removes the onDisconnect listener in the finally block to prevent listener leaks', async () => {
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: makeStream(['done']),
      listModels: vi.fn(),
    });
    const port = makePort();
    const { trigger } = setup(port);

    await trigger({ type: 'BEAUTIFY', content: 'text', providerConfig: baseProvider });

    expect(port.onDisconnect.removeListener).toHaveBeenCalledOnce();
  });

  it('does not throw an unhandled rejection when port disconnects mid-beautify', async () => {
    const abortAwareStream = vi.fn(
      async (
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
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: abortAwareStream,
      listModels: vi.fn(),
    });

    const port = makePort();
    const { trigger } = setup(port);

    port.onDisconnect._fire();
    await expect(
      trigger({ type: 'BEAUTIFY', content: 'text', providerConfig: baseProvider }),
    ).resolves.toBeUndefined();
  });
});
