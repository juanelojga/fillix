import type { ProviderConfig } from '../../types';
import type { LLMProvider } from './base';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';

export function resolveProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
    case 'openrouter':
    case 'custom':
      return new OpenAIProvider(config);
    default: {
      const _: never = config.provider;
      return _;
    }
  }
}
