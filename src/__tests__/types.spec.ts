// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  ChatMessage,
  PortMessage,
  Message,
  FieldSnapshot,
  FieldFill,
  PipelineStage,
  WorkflowDefinition,
  UnderstandOutput,
  PlanOutput,
  DraftOutput,
  ReviewOutput,
} from '../types';

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

describe('FieldSnapshot', () => {
  it('requires only currentValue; all identifier fields are optional', () => {
    const snap: FieldSnapshot = { currentValue: 'foo' };
    expectTypeOf(snap.currentValue).toBeString();
    expectTypeOf(snap.id).toEqualTypeOf<string | undefined>();
    expectTypeOf(snap.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(snap.label).toEqualTypeOf<string | undefined>();
  });
});

describe('FieldFill', () => {
  it('requires fieldId, label, currentValue, proposedValue; editedValue is optional', () => {
    const fill: FieldFill = {
      fieldId: 'email',
      label: 'Email',
      currentValue: '',
      proposedValue: 'test@example.com',
    };
    expectTypeOf(fill.editedValue).toEqualTypeOf<string | undefined>();
  });
});

describe('PipelineStage', () => {
  it('is the union of five stage strings', () => {
    const stages: PipelineStage[] = ['understand', 'collect', 'plan', 'draft', 'review'];
    expect(stages).toHaveLength(5);
  });
});

describe('WorkflowDefinition', () => {
  it('accepts all required fields with correct types', () => {
    const wf: WorkflowDefinition = {
      id: 'workflows/test.md',
      name: 'Test',
      taskType: 'form',
      tone: 'professional',
      requiredProfileFields: [],
      review: true,
      logFullOutput: false,
      autoApply: false,
      systemPrompt: 'prompt',
    };
    expectTypeOf(wf.taskType).toEqualTypeOf<
      'form' | 'field-by-field' | 'linkedin-post' | 'rewrite'
    >();
  });
});

describe('UnderstandOutput', () => {
  it('has task_type string, detected_fields array, and numeric confidence', () => {
    const out: UnderstandOutput = {
      task_type: 'form',
      detected_fields: ['name'],
      confidence: 0.9,
    };
    expectTypeOf(out.confidence).toBeNumber();
    expectTypeOf(out.detected_fields).toEqualTypeOf<string[]>();
  });
});

describe('PlanOutput', () => {
  it('has fields_to_fill array with field_id and strategy', () => {
    const out: PlanOutput = {
      fields_to_fill: [{ field_id: 'email', strategy: 'use profile' }],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    };
    expectTypeOf(out.fields_to_fill).toBeArray();
  });
});

describe('DraftOutput', () => {
  it('is an index signature mapping fieldId strings to string values', () => {
    const out: DraftOutput = { email: 'test@example.com' };
    expectTypeOf(out).toEqualTypeOf<DraftOutput>();
  });
});

describe('ReviewOutput', () => {
  it('maps fieldId to an object with revised_value and optional change_reason', () => {
    const out: ReviewOutput = {
      email: { revised_value: 'test@example.com', change_reason: 'cleaned up' },
    };
    expectTypeOf(out).toEqualTypeOf<ReviewOutput>();
  });
});
