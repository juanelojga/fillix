import type { ChatMessage } from '../../types';

export type StreamOptions = {
  signal: AbortSignal;
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

export interface LLMProvider {
  chatStream(messages: ChatMessage[], systemPrompt: string, options: StreamOptions): Promise<void>;
  listModels(): Promise<string[]>;
}
