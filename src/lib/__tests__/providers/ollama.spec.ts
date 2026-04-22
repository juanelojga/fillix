// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../../providers/ollama';
import type { ProviderConfig } from '../../../types';

vi.mock('../../ollama', () => ({
  chatStream: vi.fn(),
  listModels: vi.fn(),
}));

import * as ollamaLib from '../../ollama';

const config: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('OllamaProvider.chatStream', () => {
  it('delegates to chatStream from src/lib/ollama.ts with correct args', async () => {
    vi.mocked(ollamaLib.chatStream).mockResolvedValue(undefined);
    const provider = new OllamaProvider(config);
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const systemPrompt = 'You are helpful.';
    const options = {
      signal: new AbortController().signal,
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await provider.chatStream(messages, systemPrompt, options);

    expect(ollamaLib.chatStream).toHaveBeenCalledOnce();
    expect(ollamaLib.chatStream).toHaveBeenCalledWith(
      { baseUrl: config.baseUrl, model: config.model },
      messages,
      systemPrompt,
      options,
    );
  });

  it('does not duplicate logic — streams tokens via the existing ollama client', async () => {
    const tokens: string[] = [];
    vi.mocked(ollamaLib.chatStream).mockImplementation(async (_cfg, _msgs, _sys, opts) => {
      opts.onToken('hello');
      opts.onToken(' world');
      opts.onDone();
    });

    const provider = new OllamaProvider(config);
    const onToken = vi.fn((t: string) => tokens.push(t));
    const onDone = vi.fn();
    await provider.chatStream([], 'sys', {
      signal: new AbortController().signal,
      onToken,
      onDone,
      onError: vi.fn(),
    });

    expect(tokens).toEqual(['hello', ' world']);
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('OllamaProvider.listModels', () => {
  it('delegates to listModels from src/lib/ollama.ts', async () => {
    vi.mocked(ollamaLib.listModels).mockResolvedValue(['llama3.2', 'mistral']);
    const provider = new OllamaProvider(config);

    const models = await provider.listModels();

    expect(ollamaLib.listModels).toHaveBeenCalledOnce();
    expect(ollamaLib.listModels).toHaveBeenCalledWith({
      baseUrl: config.baseUrl,
      model: config.model,
    });
    expect(models).toEqual(['llama3.2', 'mistral']);
  });
});
