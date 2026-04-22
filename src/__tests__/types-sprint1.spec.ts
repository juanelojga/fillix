// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expectTypeOf } from 'vitest';
import type { ProviderConfig, ProviderType, SearchConfig, PortMessage, Message } from '../types';

// These tests are type-level only — they assert the TypeScript contract
// without any runtime behaviour. They will fail to compile (not at runtime)
// if the types are missing or mis-shaped, giving Gate 5 a clear signal.

describe('ProviderType', () => {
  it('accepts all four expected literal values', () => {
    const values: ProviderType[] = ['ollama', 'openai', 'openrouter', 'custom'];
    expectTypeOf(values).toMatchTypeOf<ProviderType[]>();
  });
});

describe('ProviderConfig', () => {
  it('requires provider, baseUrl, and model', () => {
    const cfg: ProviderConfig = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    };
    expectTypeOf(cfg).toMatchTypeOf<ProviderConfig>();
  });

  it('accepts optional apiKey', () => {
    const cfg: ProviderConfig = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      apiKey: 'sk-test',
    };
    expectTypeOf(cfg).toMatchTypeOf<ProviderConfig>();
  });
});

describe('SearchConfig', () => {
  it('is fully optional (empty object is valid)', () => {
    const cfg: SearchConfig = {};
    expectTypeOf(cfg).toMatchTypeOf<SearchConfig>();
  });

  it('accepts braveApiKey and searxngUrl', () => {
    const cfg: SearchConfig = { braveApiKey: 'bsak-123', searxngUrl: 'https://searx.example.com' };
    expectTypeOf(cfg).toMatchTypeOf<SearchConfig>();
  });
});

describe('PortMessage tool-call and tool-result variants', () => {
  it('tool-call variant has toolName and args', () => {
    const msg: PortMessage = {
      type: 'tool-call',
      toolName: 'web_search',
      args: { query: 'AI news' },
    };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });

  it('tool-result variant has toolName and result', () => {
    const msg: PortMessage = {
      type: 'tool-result',
      toolName: 'web_search',
      result: '1. Result...',
    };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('Message LIST_MODELS variant', () => {
  it('LIST_MODELS is a valid Message type', () => {
    const msg: Message = { type: 'LIST_MODELS' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});

describe('CHAT_START provider field', () => {
  it('accepts optional provider field', () => {
    const msg: Message = {
      type: 'CHAT_START',
      messages: [],
      systemPrompt: 'test',
      provider: 'openai',
    };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('remains valid without provider field (backward compat)', () => {
    const msg: Message = { type: 'CHAT_START', messages: [], systemPrompt: 'test' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});
