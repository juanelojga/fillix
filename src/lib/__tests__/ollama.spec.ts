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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, body: null, text: async () => '' }),
    );

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

// --- Sprint 4: generateStructured<T> specs (Task 4.1) ---

import { generateStructured } from '../ollama';

describe('generateStructured', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/generate with system, prompt, stream: false, format: json', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ response: '{"task_type":"form","detected_fields":[],"confidence":0.9}' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await generateStructured<{ task_type: string }>(CONFIG, 'sys', 'user');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('llama3.2');
    expect(body.system).toBe('sys');
    expect(body.prompt).toBe('user');
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
  });

  it('parses data.response as JSON and returns it typed as T', async () => {
    const payload = { task_type: 'form', detected_fields: ['name'], confidence: 0.95 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(payload) }),
      }),
    );

    const result = await generateStructured<typeof payload>(CONFIG, 'sys', 'user');
    expect(result).toEqual(payload);
  });

  it('throws if data.response is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'not-json' }),
      }),
    );

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow();
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow(/500/);
  });

  it('throws when response is empty and thinking is a reasoning scratchpad {"thoughts":[...]}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: '',
            thinking: JSON.stringify({ thoughts: ['step 1', 'step 2'] }),
          }),
      }),
    );

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow(
      'Model returned empty response',
    );
  });

  it('throws when response is empty and thinking is a {"reasoning":"..."} scratchpad', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: '',
            thinking: JSON.stringify({ reasoning: 'I need to think about this...' }),
          }),
      }),
    );

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow(
      'Model returned empty response',
    );
  });

  it('throws when response is empty and thinking is a {"thinking":"..."} scratchpad', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: '',
            thinking: JSON.stringify({ thinking: 'internal monologue' }),
          }),
      }),
    );

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow(
      'Model returned empty response',
    );
  });

  it('throws when response is empty and thinking is a {"thought":"..."} scratchpad (qwen3 pattern)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: '',
            thinking: JSON.stringify({ thought: 'This is a Toptal job matcher...' }),
          }),
      }),
    );

    await expect(generateStructured(CONFIG, 'sys', 'user')).rejects.toThrow(
      'Model returned empty response',
    );
  });

  it('sends think: false in the request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: '{"ok":true}' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await generateStructured(CONFIG, 'sys', 'user');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.think).toBe(false);
  });

  it('returns structured output from thinking field when it contains valid domain JSON', async () => {
    const payload = {
      fields_to_fill: [{ field_id: 'name', strategy: 'use profile.name' }],
      missing_fields: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: '',
            thinking: JSON.stringify(payload),
          }),
      }),
    );

    const result = await generateStructured<typeof payload>(CONFIG, 'sys', 'user');
    expect(result).toEqual(payload);
  });
});
