// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../providers/openai';
import type { ProviderConfig } from '../../../types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.stubGlobal('chrome', {
  runtime: { id: 'test-extension-id' },
});

beforeEach(() => {
  vi.resetAllMocks();
});

function makeSSEStream(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const openaiConfig: ProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o',
  apiKey: 'sk-test',
};

const openrouterConfig: ProviderConfig = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api',
  model: 'mistral-7b',
  apiKey: 'or-test',
};

const customConfig: ProviderConfig = {
  provider: 'custom',
  baseUrl: 'http://lm-studio:1234',
  model: 'local-model',
};

describe('OpenAIProvider.chatStream', () => {
  it('POSTs to <baseUrl>/v1/chat/completions with correct body', async () => {
    mockFetch.mockResolvedValue(makeSSEStream(['data: [DONE]']));
    const provider = new OpenAIProvider(openaiConfig);
    const messages = [{ role: 'user' as const, content: 'hi' }];

    await provider.chatStream(messages, 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('sends Authorization: Bearer header with apiKey', async () => {
    mockFetch.mockResolvedValue(makeSSEStream(['data: [DONE]']));
    const provider = new OpenAIProvider(openaiConfig);

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });

  it('emits tokens from SSE delta content lines', async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}`,
      'data: [DONE]',
    ];
    mockFetch.mockResolvedValue(makeSSEStream(sseLines));
    const provider = new OpenAIProvider(openaiConfig);
    const tokens: string[] = [];

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(tokens).toEqual(['hello', ' world']);
  });

  it('calls onDone when [DONE] sentinel is received', async () => {
    mockFetch.mockResolvedValue(makeSSEStream(['data: [DONE]']));
    const provider = new OpenAIProvider(openaiConfig);
    const onDone = vi.fn();

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone,
      onError: vi.fn(),
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('calls onDone when stream closes without [DONE] sentinel (truncated response)', async () => {
    mockFetch.mockResolvedValue(
      makeSSEStream([`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}`]),
    );
    const provider = new OpenAIProvider(openaiConfig);
    const onDone = vi.fn();

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone,
      onError: vi.fn(),
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('calls onError and does not throw on non-2xx response', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const provider = new OpenAIProvider(openaiConfig);
    const onError = vi.fn();

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toContain('401');
  });

  it('adds HTTP-Referer and X-Title headers for OpenRouter provider', async () => {
    mockFetch.mockResolvedValue(makeSSEStream(['data: [DONE]']));
    const provider = new OpenAIProvider(openrouterConfig);

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toContain('test-extension-id');
    expect(headers['X-Title']).toBe('Fillix');
  });

  it('works without apiKey for custom provider', async () => {
    mockFetch.mockResolvedValue(makeSSEStream(['data: [DONE]']));
    const provider = new OpenAIProvider(customConfig);
    const onError = vi.fn();

    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('OpenAIProvider.listModels', () => {
  it('GETs <baseUrl>/v1/models and returns sorted model IDs', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5-turbo' }, { id: 'gpt-4' }] }),
        { status: 200 },
      ),
    );
    const provider = new OpenAIProvider(openaiConfig);

    const models = await provider.listModels();

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(models).toEqual(['gpt-3.5-turbo', 'gpt-4', 'gpt-4o']);
  });

  it('sends Authorization: Bearer header', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const provider = new OpenAIProvider(openaiConfig);
    await provider.listModels();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });

  it('throws on non-2xx response from /v1/models', async () => {
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const provider = new OpenAIProvider(openaiConfig);

    await expect(provider.listModels()).rejects.toThrow('403');
  });
});
