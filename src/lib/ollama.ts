import type { ChatMessage, FieldContext, OllamaConfig } from '../types';

export type StreamOptions = {
  signal: AbortSignal;
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

type ChatLine = { message: { content: string; thinking?: string }; done: boolean };

export async function chatStream(
  config: OllamaConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  options: StreamOptions,
): Promise<void> {
  const { signal, onToken, onThinking, onDone, onError } = options;
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) return;
    onError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    onError(`Ollama /api/chat returned ${res.status}${body ? `: ${body}` : ''}`);
    return;
  }

  if (!res.body) {
    onError('Ollama /api/chat returned no response body');
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        if (signal.aborted) return;
        const parsed = JSON.parse(line) as ChatLine;
        const { content, thinking } = parsed.message;
        if (thinking) onThinking?.(thinking);
        if (content) onToken(content);
        if (parsed.done) {
          onDone();
          return;
        }
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    reader.releaseLock();
  }
}

// Cold-loading a large model into VRAM can take a while; keep the ceiling generous
// so a slow first run reads as "slow" rather than "broken".
const TEST_TIMEOUT_MS = 30_000;

/**
 * Runs one tiny generation against `config.model` and returns how long it took.
 * Throws with Ollama's own error body so a missing model surfaces as
 * `model "x" not found, try pulling it first` rather than a bare status code.
 *
 * `num_predict: 1` is what keeps this tiny. Without it a reasoning model answers
 * "ping" with hundreds of thinking tokens, which on a cold load pushes the round
 * trip past TEST_TIMEOUT_MS and reports a working model as a timeout.
 */
export async function testModel(config: OllamaConfig, signal?: AbortSignal): Promise<number> {
  const started = Date.now();
  const res = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      options: { num_predict: 1 },
    }),
    signal: signal ?? AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const detail = extractOllamaError(body);
    throw new Error(`Ollama /api/chat returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  await res.json();
  return Date.now() - started;
}

function extractOllamaError(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as { error?: string };
    return parsed.error ?? body;
  } catch {
    return body;
  }
}

export async function generateStructured<T>(
  config: { baseUrl: string; model: string },
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      format: 'json',
      think: false,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
  const data = (await res.json()) as { response: string; thinking?: string };
  const raw = (data.response || '').trim();
  if (raw) return parseJsonResponse<T>(raw);

  // Thinking models (qwen3) sometimes put the structured JSON directly in the
  // thinking field and leave response empty. Accept that — but reject any object
  // whose every top-level key is a known reasoning-scratchpad key.
  const thinkingRaw = (data.thinking || '').trim();
  if (thinkingRaw) {
    const REASONING_KEYS = new Set([
      'thinking',
      'thought',
      'thoughts',
      'reasoning',
      'scratchpad',
      'think',
    ]);
    try {
      const parsed = JSON.parse(thinkingRaw) as Record<string, unknown>;
      const keys = Object.keys(parsed);
      const isReasoningScratchpad = keys.length > 0 && keys.every((k) => REASONING_KEYS.has(k));
      if (!isReasoningScratchpad) {
        return parsed as T;
      }
    } catch {
      // not clean JSON — fall through to error
    }
  }

  throw new Error('Model returned empty response');
}

function parseJsonResponse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const stripped = raw
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as T;
      } catch {
        // fall through
      }
    }
    throw new Error(`Model returned invalid JSON: ${raw.slice(0, 120)}`);
  }
}

export async function inferFieldValue(config: OllamaConfig, field: FieldContext): Promise<string> {
  const res = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: buildPrompt(field),
      stream: false,
      format: 'json',
      think: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
  const data = (await res.json()) as { response: string };
  try {
    const parsed = JSON.parse(data.response) as { value?: string };
    return parsed.value ?? '';
  } catch {
    return '';
  }
}

function buildPrompt(field: FieldContext): string {
  return [
    'You are helping fill a web form. Given a form field, pick the best value for the field.',
    'Respond with JSON only in the shape {"value": "<best value or empty string>"}. Do not invent data.',
    `Field: ${JSON.stringify(field)}`,
  ].join('\n');
}
