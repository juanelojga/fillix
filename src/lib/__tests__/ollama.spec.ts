// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatStream } from '../ollama';
import type { OllamaConfig } from '../../types';
import type { ChatMessage } from '../../types';

const CONFIG: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };
const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
const SYSTEM_PROMPT = 'Be concise.';

function makeNdjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

describe('chatStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onToken for each non-done line and onDone at the end', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ' world' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true }),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: makeNdjsonStream(lines) }));

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken,
      onDone,
      onError,
    });

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onToken).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('posts to /api/chat with model, system message prepended, and stream: true', async () => {
    const lines = [JSON.stringify({ message: { content: 'ok' }, done: true })];
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, body: makeNdjsonStream(lines) });
    vi.stubGlobal('fetch', mockFetch);

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
      stream: boolean;
    };
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toMatchObject({ role: 'system', content: SYSTEM_PROMPT });
    expect(body.messages[1]).toMatchObject({ role: 'user', content: 'Hello' });
  });

  it('handles chunk boundary splits (JSON line split across two chunks)', async () => {
    const fullLine = JSON.stringify({ message: { content: 'split' }, done: true });
    const half1 = fullLine.slice(0, 10);
    const half2 = fullLine.slice(10);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(half1));
        controller.enqueue(encoder.encode(half2 + '\n'));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }));

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken,
      onDone,
      onError,
    });

    expect(onToken).toHaveBeenCalledWith('split');
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops calling onToken and does not call onDone or onError when aborted mid-stream', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(
          encoder.encode(JSON.stringify({ message: { content: 'first' }, done: false }) + '\n'),
        );
        // Abort before second chunk
        controller.abort();
        ctrl.enqueue(
          encoder.encode(JSON.stringify({ message: { content: 'second' }, done: false }) + '\n'),
        );
        ctrl.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }));

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: controller.signal,
      onToken,
      onDone,
      onError,
    });

    // After abort: onDone and onError must NOT be called
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when fetch returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, body: null }));

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken,
      onDone,
      onError,
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatch(/500/);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onError when fetch throws (e.g. network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith('network error');
  });

  it('calls onError when a line is not valid JSON', async () => {
    const lines = ['not-json\n'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: makeNdjsonStream(lines) }));

    const onError = vi.fn();

    await chatStream(CONFIG, MESSAGES, SYSTEM_PROMPT, {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledOnce();
  });
});
