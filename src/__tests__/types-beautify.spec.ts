// Tests for Task 1.1: new PortMessage variants and ChatMessage.beautifyError
// These will FAIL typecheck until Gate 4 adds the new variants to src/types.ts.
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ChatMessage, PortMessage, ProviderConfig } from '../types';
import type { StreamingState, ActiveMessage } from '../sidepanel/stores/chat';

const baseProvider: ProviderConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

describe('PortMessage — BEAUTIFY variant', () => {
  it('accepts BEAUTIFY type with content and providerConfig', () => {
    const msg: PortMessage = {
      type: 'BEAUTIFY',
      content: 'raw assistant text',
      providerConfig: baseProvider,
    };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('PortMessage — beautified variant', () => {
  it('accepts beautified type with content', () => {
    const msg: PortMessage = { type: 'beautified', content: 'formatted text' };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('PortMessage — beautify-error variant', () => {
  it('accepts beautify-error type with reason', () => {
    const msg: PortMessage = { type: 'beautify-error', reason: 'network error' };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('ChatMessage — beautifyError field', () => {
  it('accepts optional beautifyError on an assistant message', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'raw fallback text',
      beautifyError: 'Could not beautify',
    };
    expectTypeOf(msg.beautifyError).toEqualTypeOf<string | undefined>();
  });

  it('remains valid without beautifyError', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'clean text' };
    expect(msg.beautifyError).toBeUndefined();
  });
});

describe('StreamingState — beautifying value', () => {
  it('accepts "beautifying" as a valid StreamingState', () => {
    const state: StreamingState = 'beautifying';
    expectTypeOf(state).toEqualTypeOf<StreamingState>();
  });
});

describe('ActiveMessage — isBeautifying flag', () => {
  it('accepts optional isBeautifying boolean', () => {
    const msg: ActiveMessage = {
      content: 'streaming…',
      thinking: '',
      toolCalls: [],
      isBeautifying: true,
    };
    expectTypeOf(msg.isBeautifying).toEqualTypeOf<boolean | undefined>();
  });
});
