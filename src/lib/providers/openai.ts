import type { ChatMessage, ProviderConfig } from '../../types';
import type { LLMProvider, StreamOptions } from './base';

export class OpenAIProvider implements LLMProvider {
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chatStream(
    messages: ChatMessage[],
    systemPrompt: string,
    options: StreamOptions,
  ): Promise<void> {
    const { signal, onToken, onThinking: _onThinking, onDone, onError } = options;

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
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
      onError(`OpenAI-compatible API returned ${res.status}${body ? `: ${body}` : ''}`);
      return;
    }

    if (!res.body) {
      onError('OpenAI-compatible API returned no response body');
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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            onDone();
            return;
          }
          if (!payload.startsWith('{')) continue;
          try {
            const chunk = JSON.parse(payload) as {
              choices: [{ delta: { content?: string } }];
            };
            const content = chunk.choices[0]?.delta?.content;
            if (content) onToken(content);
          } catch {
            // malformed SSE line — skip silently
          }
        }
      }
      // Stream closed by server without [DONE] sentinel (truncated / connection drop)
      onDone();
    } catch (err) {
      if (signal.aborted) return;
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.config.baseUrl}/v1/models`, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`/v1/models returned ${res.status}`);
    const data = (await res.json()) as { data: { id: string }[] };
    return data.data.map((m) => m.id).sort();
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.provider === 'openrouter') {
      headers['HTTP-Referer'] = `chrome-extension://${chrome.runtime.id}`;
      headers['X-Title'] = 'Fillix';
    }
    return headers;
  }
}
