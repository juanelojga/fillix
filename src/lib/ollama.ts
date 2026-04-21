import type { ChatMessage, FieldContext, OllamaConfig } from '../types';

type StreamOptions = {
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

export async function listModels(config: OllamaConfig): Promise<string[]> {
  const res = await fetch(`${config.baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
  const data = (await res.json()) as { models: { name: string }[] };
  return data.models.map((m) => m.name);
}

export async function generateStructured<T>(
  config: OllamaConfig,
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
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
  const data = (await res.json()) as { response: string; thinking?: string };
  return parseJsonResponse<T>(data.response || data.thinking || '');
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
