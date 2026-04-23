// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Message, PipelineStage, WorkflowDefinition, ConversationMessage } from '../types';

const typesSrc = readFileSync(resolve(process.cwd(), 'src/types.ts'), 'utf-8');

// ── Source-level checks (Task 1.5) ────────────────────────────────────────────

describe('types.ts source — new Message union members (Task 1.5)', () => {
  it('contains AGENTIC_PLAN_REVIEW', () => {
    expect(typesSrc).toContain('AGENTIC_PLAN_REVIEW');
  });

  it('contains AGENTIC_PLAN_FEEDBACK', () => {
    expect(typesSrc).toContain('AGENTIC_PLAN_FEEDBACK');
  });

  it('contains AGENTIC_FILLS_REVIEW', () => {
    expect(typesSrc).toContain('AGENTIC_FILLS_REVIEW');
  });

  it('contains AGENTIC_FILLS_FEEDBACK', () => {
    expect(typesSrc).toContain('AGENTIC_FILLS_FEEDBACK');
  });

  it('contains AGENTIC_SUMMARY', () => {
    expect(typesSrc).toContain('AGENTIC_SUMMARY');
  });

  it('contains EXTRACT_CONVERSATION', () => {
    expect(typesSrc).toContain('EXTRACT_CONVERSATION');
  });

  it('contains CONVERSATION_DATA', () => {
    expect(typesSrc).toContain('CONVERSATION_DATA');
  });

  it('contains INSERT_TEXT', () => {
    expect(typesSrc).toContain('INSERT_TEXT');
  });

  it('no longer contains AGENTIC_CONFIRM (removed)', () => {
    expect(typesSrc).not.toContain('AGENTIC_CONFIRM');
  });

  it('no longer contains AGENTIC_APPLY (removed)', () => {
    expect(typesSrc).not.toContain('AGENTIC_APPLY');
  });
});

describe('types.ts source — ConversationMessage interface (Task 1.5)', () => {
  it('defines ConversationMessage interface', () => {
    expect(typesSrc).toContain('ConversationMessage');
  });

  it('ConversationMessage has sender field with me | them union', () => {
    expect(typesSrc).toMatch(/sender.*'me'.*'them'|sender.*"me".*"them"/);
  });

  it('ConversationMessage has text field', () => {
    expect(typesSrc).toMatch(/ConversationMessage[\s\S]{0,200}text:/);
  });
});

describe('types.ts source — PipelineStage extension (Task 1.5)', () => {
  it('PipelineStage includes plan-review', () => {
    expect(typesSrc).toContain('plan-review');
  });

  it('PipelineStage includes fills-review', () => {
    expect(typesSrc).toContain('fills-review');
  });
});

describe('types.ts source — WorkflowDefinition.taskType extension (Task 1.5)', () => {
  it('taskType union includes message-reply', () => {
    expect(typesSrc).toContain('message-reply');
  });
});

// ── Type-level checks ─────────────────────────────────────────────────────────

describe('ConversationMessage type contract', () => {
  it('accepts sender "me" and text string', () => {
    const msg: ConversationMessage = { sender: 'me', text: 'hello' };
    expectTypeOf(msg.sender).toEqualTypeOf<'me' | 'them'>();
    expectTypeOf(msg.text).toBeString();
  });

  it('accepts sender "them" and text string', () => {
    const msg: ConversationMessage = { sender: 'them', text: 'reply' };
    expectTypeOf(msg.sender).toEqualTypeOf<'me' | 'them'>();
  });
});

describe('PipelineStage — extended union', () => {
  it('includes plan-review as a valid stage', () => {
    const stage: PipelineStage = 'plan-review';
    expectTypeOf(stage).toMatchTypeOf<PipelineStage>();
  });

  it('includes fills-review as a valid stage', () => {
    const stage: PipelineStage = 'fills-review';
    expectTypeOf(stage).toMatchTypeOf<PipelineStage>();
  });

  it('still includes the original five stages', () => {
    const stages: PipelineStage[] = ['understand', 'collect', 'plan', 'draft', 'review'];
    expect(stages).toHaveLength(5);
  });
});

describe('WorkflowDefinition.taskType — message-reply variant', () => {
  it('accepts message-reply as taskType', () => {
    const wf: WorkflowDefinition = {
      id: 'workflows/reply.md',
      name: 'Reply',
      taskType: 'message-reply',
      tone: 'friendly',
      requiredProfileFields: [],
      review: false,
      logFullOutput: false,
      autoApply: false,
      systemPrompt: '',
    };
    expectTypeOf(wf.taskType).toMatchTypeOf<WorkflowDefinition['taskType']>();
  });
});

describe('Message union — new gate message types', () => {
  it('AGENTIC_PLAN_REVIEW is a valid Message type', () => {
    const msg: Message = {
      type: 'AGENTIC_PLAN_REVIEW',
      plan: { fields_to_fill: [], missing_fields: [], tone: '', notes: '' },
    };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('AGENTIC_PLAN_FEEDBACK with approved: true is a valid Message type', () => {
    const msg: Message = { type: 'AGENTIC_PLAN_FEEDBACK', approved: true };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('AGENTIC_PLAN_FEEDBACK with feedback string is a valid Message type', () => {
    const msg: Message = {
      type: 'AGENTIC_PLAN_FEEDBACK',
      approved: false,
      feedback: 'change tone',
    };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('AGENTIC_FILLS_FEEDBACK with approved: true is a valid Message type', () => {
    const msg: Message = { type: 'AGENTIC_FILLS_FEEDBACK', approved: true };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('AGENTIC_SUMMARY is a valid Message type', () => {
    const msg: Message = { type: 'AGENTIC_SUMMARY', applied: 3, skipped: 1, durationMs: 1200 };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('EXTRACT_CONVERSATION is a valid Message type', () => {
    const msg: Message = { type: 'EXTRACT_CONVERSATION' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('INSERT_TEXT is a valid Message type', () => {
    const msg: Message = { type: 'INSERT_TEXT', text: 'hello reply' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});
