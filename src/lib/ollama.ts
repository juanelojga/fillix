import type { ChatMessage, FieldContext, OllamaConfig, UserProfile } from '../types';

type StreamOptions = {
  signal: AbortSignal;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

type ChatLine = { message: { content: string }; done: boolean };

export async function chatStream(
  config: OllamaConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  options: StreamOptions,
): Promise<void> {
  const { signal, onToken, onDone, onError } = options;
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
        if (!parsed.done) {
          onToken(parsed.message.content);
        } else {
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

export async function inferFieldValue(
  config: OllamaConfig,
  field: FieldContext,
  profile: UserProfile,
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: buildPrompt(field, profile),
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

function buildPrompt(field: FieldContext, profile: UserProfile): string {
  return [
    'You are helping fill a web form. Given a form field and a user profile, pick the best profile value for the field.',
    'Respond with JSON only in the shape {"value": "<best value or empty string>"}. Do not invent data.',
    `Field: ${JSON.stringify(field)}`,
    `Profile: ${JSON.stringify(profile)}`,
  ].join('\n');
}
