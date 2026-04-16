// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expectTypeOf } from 'vitest';
import type { ChatMessage, PortMessage, Message } from '../types';

describe('ChatMessage', () => {
  it('accepts role "user" with string content', () => {
    const msg: ChatMessage = { role: 'user', content: 'Hello' };
    expectTypeOf(msg.role).toEqualTypeOf<'user' | 'assistant'>();
    expectTypeOf(msg.content).toEqualTypeOf<string>();
  });

  it('accepts role "assistant" with string content', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'Hi there' };
    expectTypeOf(msg.role).toEqualTypeOf<'user' | 'assistant'>();
  });
});

describe('PortMessage', () => {
  it('token variant has a value field', () => {
    const msg: PortMessage = { type: 'token', value: 'hello' };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });

  it('done variant has no extra fields', () => {
    const msg: PortMessage = { type: 'done' };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });

  it('error variant has an error string field', () => {
    const msg: PortMessage = { type: 'error', error: 'timeout' };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('Message union — chat variants', () => {
  it('CHAT_START carries messages array and systemPrompt', () => {
    const msg: Message = {
      type: 'CHAT_START',
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'Be helpful',
    };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('CHAT_STOP carries no payload', () => {
    const msg: Message = { type: 'CHAT_STOP' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});
