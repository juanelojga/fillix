import type { ChatMessage, OllamaConfig, ProviderConfig } from '../../types';
import { chatStream, listModels } from '../ollama';
import type { LLMProvider, StreamOptions } from './base';

export class OllamaProvider implements LLMProvider {
  private readonly config: OllamaConfig;

  constructor(config: ProviderConfig) {
    this.config = { baseUrl: config.baseUrl, model: config.model };
  }

  chatStream(messages: ChatMessage[], systemPrompt: string, options: StreamOptions): Promise<void> {
    return chatStream(this.config, messages, systemPrompt, options);
  }

  listModels(): Promise<string[]> {
    return listModels(this.config);
  }
}
