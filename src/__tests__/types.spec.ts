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
  MessageResponse,
  NewsCategory,
  NewsItem,
  NewsSourceFailure,
  NewsSummary,
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
      'form' | 'field-by-field' | 'linkedin-post' | 'rewrite' | 'message-reply'
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

describe('PortMessage tool-call and tool-result variants', () => {
  it('tool-call variant has toolName and args', () => {
    const msg: PortMessage = {
      type: 'tool-call',
      toolName: 'news_feed',
      args: { topic: 'AI news' },
    };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });

  it('tool-result variant has toolName and result', () => {
    const msg: PortMessage = {
      type: 'tool-result',
      toolName: 'news_feed',
      result: '1. Result...',
    };
    expectTypeOf(msg).toMatchTypeOf<PortMessage>();
  });
});

describe('Message TEST_MODEL variant', () => {
  it('TEST_MODEL carries the model name to test', () => {
    const msg: Message = { type: 'TEST_MODEL', model: 'qwen3:8b' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});

describe('CHAT_START model field', () => {
  it('accepts an optional model override', () => {
    const msg: Message = {
      type: 'CHAT_START',
      messages: [],
      systemPrompt: 'test',
      model: 'phi3',
    };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });

  it('remains valid without the model field', () => {
    const msg: Message = { type: 'CHAT_START', messages: [], systemPrompt: 'test' };
    expectTypeOf(msg).toMatchTypeOf<Message>();
  });
});

describe('News message contract', () => {
  it('accepts the three News request variants', () => {
    const item: NewsItem = {
      id: 'hn:1',
      category: 'ai',
      title: 'A story',
      url: 'https://example.com/1',
      source: 'example.com',
      meta: '1 point',
      publishedAt: '2026-09-16T09:00:00Z',
      snippet: '',
    };

    expectTypeOf<Message>().toMatchTypeOf<Message>();
    const refresh: Message = { type: 'NEWS_REFRESH' };
    const article: Message = { type: 'NEWS_ARTICLE', item };
    const summarize: Message = {
      type: 'NEWS_SUMMARIZE',
      title: 'A story',
      source: 'example.com',
      text: 'body',
    };

    expectTypeOf(refresh).toMatchTypeOf<Message>();
    expectTypeOf(article).toMatchTypeOf<Message>();
    expectTypeOf(summarize).toMatchTypeOf<Message>();
  });

  it('restricts NewsCategory to the four fixed values', () => {
    expectTypeOf<NewsCategory>().toEqualTypeOf<
      'ai' | 'technology' | 'software-development' | 'curiosities'
    >();
  });

  // Success arms are told apart only by payload key shape, so each new key must narrow
  // to exactly one arm. Reusing `content` or `value` here would cross-wire silently.
  it('narrows each News response by its own key', () => {
    const news: MessageResponse = { ok: true, news: [], degraded: [] };
    if (news.ok && 'news' in news) {
      expectTypeOf(news.news).toEqualTypeOf<NewsItem[]>();
      expectTypeOf(news.degraded).toEqualTypeOf<NewsSourceFailure[]>();
    }

    const article: MessageResponse = { ok: true, article: { text: 'x', origin: 'article' } };
    if (article.ok && 'article' in article) {
      expectTypeOf(article.article.origin).toEqualTypeOf<'snippet' | 'article'>();
    }

    const summary: MessageResponse = { ok: true, summary: { summary: 'x', keyPoints: [] } };
    if (summary.ok && 'summary' in summary) {
      expectTypeOf(summary.summary).toEqualTypeOf<NewsSummary>();
    }
  });
});
