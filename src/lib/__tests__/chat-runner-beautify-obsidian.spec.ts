// Tests for Task 2.2: Obsidian beautifierPromptPath fetch inside the BEAUTIFY handler.
// These will FAIL at runtime until Gate 4 adds the fetch logic to chat-runner.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      removeListener: vi.fn(),
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

function makeStream(tokens?: string[]) {
  return vi.fn(
    async (
      _msgs: unknown,
      _sys: unknown,
      opts: { onToken: (t: string) => void; onDone: () => void; onError?: (e: string) => void },
    ) => {
      for (const t of tokens ?? ['ok']) opts.onToken(t);
      opts.onDone();
    },
  );
}

describe('BEAUTIFY handler — Obsidian beautifierPromptPath', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveProvider).mockReturnValue({
      chatStream: makeStream(),
      listModels: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes no fetch call and uses DEFAULT_BEAUTIFIER_PROMPT when beautifierPromptPath is unset', async () => {
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: 'key',
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const port = makePort();
    const { trigger } = setup(port);
    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    expect(fetchSpy).not.toHaveBeenCalled();
    const chatStreamFn = vi.mocked(resolveProvider).mock.results[0].value.chatStream;
    const [, systemPrompt] = chatStreamFn.mock.calls[0] as [unknown, string, unknown];
    expect(systemPrompt.trim().length).toBeGreaterThan(0);
  });

  it('fetches the Obsidian note and uses its text as the system prompt when beautifierPromptPath is set', async () => {
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: 'my-key',
      beautifierPromptPath: 'prompts/beautifier.md',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('Custom beautifier instructions'),
      }),
    );

    const port = makePort();
    const { trigger } = setup(port);
    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    const chatStreamFn = vi.mocked(resolveProvider).mock.results[0].value.chatStream;
    const [, systemPrompt] = chatStreamFn.mock.calls[0] as [unknown, string, unknown];
    expect(systemPrompt).toBe('Custom beautifier instructions');
  });

  it('posts { type:"beautify-error" } when the Obsidian fetch returns a non-ok status (e.g. 404)', async () => {
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: 'my-key',
      beautifierPromptPath: 'prompts/missing.md',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
      }),
    );

    const port = makePort();
    const { trigger } = setup(port);
    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    const errMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'beautify-error',
    );
    expect(errMsg).toBeDefined();
    expect((errMsg as { reason: string }).reason).toMatch(/404|unreachable/i);
  });

  it('posts { type:"beautify-error" } when the Obsidian fetch throws a network error', async () => {
    vi.mocked(storage.getObsidianConfig).mockResolvedValue({
      host: 'localhost',
      port: 27123,
      apiKey: 'my-key',
      beautifierPromptPath: 'prompts/beautifier.md',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const port = makePort();
    const { trigger } = setup(port);
    await trigger({ type: 'BEAUTIFY', content: 'raw', providerConfig: baseProvider });

    const errMsg = port.sent.find(
      (m: unknown) => (m as { type: string }).type === 'beautify-error',
    );
    expect(errMsg).toBeDefined();
  });
});
