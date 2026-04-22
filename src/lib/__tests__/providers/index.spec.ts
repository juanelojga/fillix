// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../../providers/index';
import { OllamaProvider } from '../../providers/ollama';
import { OpenAIProvider } from '../../providers/openai';
import type { ProviderConfig } from '../../../types';

describe('resolveProvider', () => {
  it('returns OllamaProvider for provider: ollama', () => {
    const config: ProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    };
    expect(resolveProvider(config)).toBeInstanceOf(OllamaProvider);
  });

  it('returns OpenAIProvider for provider: openai', () => {
    const config: ProviderConfig = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      apiKey: 'sk-x',
    };
    expect(resolveProvider(config)).toBeInstanceOf(OpenAIProvider);
  });

  it('returns OpenAIProvider for provider: openrouter', () => {
    const config: ProviderConfig = {
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api',
      model: 'mistral-7b',
      apiKey: 'or-x',
    };
    expect(resolveProvider(config)).toBeInstanceOf(OpenAIProvider);
  });

  it('returns OpenAIProvider for provider: custom', () => {
    const config: ProviderConfig = {
      provider: 'custom',
      baseUrl: 'http://lm-studio:1234',
      model: 'local',
    };
    expect(resolveProvider(config)).toBeInstanceOf(OpenAIProvider);
  });
});
