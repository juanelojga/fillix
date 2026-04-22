// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expectTypeOf } from 'vitest';
import type { LLMProvider, StreamOptions } from '../../providers/base';
import type { ChatMessage } from '../../../types';

// Type-level only — verifies the interface shape matches the plan spec.
// Will fail to compile if the interface is missing or mis-shaped.

describe('StreamOptions', () => {
  it('has all required fields matching the shape in src/lib/ollama.ts', () => {
    const opts: StreamOptions = {
      signal: new AbortController().signal,
      onToken: (_t: string) => {},
      onDone: () => {},
      onError: (_e: string) => {},
    };
    expectTypeOf(opts).toMatchTypeOf<StreamOptions>();
  });

  it('accepts optional onThinking callback', () => {
    const opts: StreamOptions = {
      signal: new AbortController().signal,
      onToken: (_t: string) => {},
      onThinking: (_t: string) => {},
      onDone: () => {},
      onError: (_e: string) => {},
    };
    expectTypeOf(opts).toMatchTypeOf<StreamOptions>();
  });
});

describe('LLMProvider interface', () => {
  it('chatStream accepts ChatMessage[], systemPrompt string, and StreamOptions', () => {
    type ChatStreamSig = LLMProvider['chatStream'];
    expectTypeOf<ChatStreamSig>().toBeFunction();
    expectTypeOf<ChatStreamSig>().parameters.toMatchTypeOf<
      [ChatMessage[], string, StreamOptions]
    >();
    expectTypeOf<ChatStreamSig>().returns.toMatchTypeOf<Promise<void>>();
  });

  it('listModels returns Promise<string[]>', () => {
    type ListModelsSig = LLMProvider['listModels'];
    expectTypeOf<ListModelsSig>().returns.toMatchTypeOf<Promise<string[]>>();
  });
});
