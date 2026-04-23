// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runUnderstand, runPlan, runDraft, runReview, stripThinking } from '../pipeline';
import type {
  OllamaConfig,
  WorkflowDefinition,
  FieldSnapshot,
  UnderstandOutput,
  PlanOutput,
  DraftOutput,
  ConversationMessage,
} from '../../types';

const CONFIG: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'gemma3:4b' };

const WORKFLOW: WorkflowDefinition = {
  id: 'workflows/job-application.md',
  name: 'Job Application',
  taskType: 'form',
  tone: 'professional',
  requiredProfileFields: ['name', 'email'],
  review: true,
  logFullOutput: false,
  autoApply: false,
  systemPrompt: 'Fill this job application form based on the provided profile.',
};

const FIELDS: FieldSnapshot[] = [
  { id: 'name', label: 'Full Name', type: 'text', currentValue: '' },
  { id: 'email', label: 'Email', type: 'email', currentValue: '' },
];

const mockGenerateStructured = vi.hoisted(() => vi.fn());

vi.mock('../ollama', () => ({
  generateStructured: mockGenerateStructured,
  chatStream: vi.fn(),
  listModels: vi.fn(),
  inferFieldValue: vi.fn(),
}));

describe('runUnderstand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateStructured and returns UnderstandOutput', async () => {
    const output: UnderstandOutput = {
      task_type: 'form',
      detected_fields: ['name', 'email'],
      confidence: 0.92,
    };
    mockGenerateStructured.mockResolvedValue(output);

    const result = await runUnderstand(CONFIG, WORKFLOW, FIELDS, 'https://example.com/apply');
    expect(result).toEqual(output);
    expect(mockGenerateStructured).toHaveBeenCalledOnce();
  });

  it('passes workflow.systemPrompt as the system prompt argument', async () => {
    mockGenerateStructured.mockResolvedValue({
      task_type: 'form',
      detected_fields: [],
      confidence: 0.5,
    });

    await runUnderstand(CONFIG, WORKFLOW, FIELDS, 'https://example.com');

    const [, systemPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(systemPrompt).toBe(WORKFLOW.systemPrompt);
  });

  it('includes the page URL in the user prompt', async () => {
    mockGenerateStructured.mockResolvedValue({
      task_type: 'form',
      detected_fields: [],
      confidence: 0.5,
    });

    await runUnderstand(CONFIG, WORKFLOW, FIELDS, 'https://jobs.example.com/apply');

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).toContain('https://jobs.example.com/apply');
  });

  it('truncates field list to label+type only when there are more than 15 fields', async () => {
    const manyFields: FieldSnapshot[] = Array.from({ length: 16 }, (_, i) => ({
      id: `field_${i}`,
      label: `Field ${i}`,
      type: 'text',
      currentValue: `value_${i}`,
      placeholder: `hint_${i}`,
    }));
    mockGenerateStructured.mockResolvedValue({
      task_type: 'form',
      detected_fields: [],
      confidence: 0.5,
    });

    await runUnderstand(CONFIG, WORKFLOW, manyFields, 'https://example.com');

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).not.toContain('value_0');
    expect(userPrompt).not.toContain('hint_0');
  });

  it('throws when generateStructured rejects', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('Ollama timeout'));

    await expect(runUnderstand(CONFIG, WORKFLOW, FIELDS, 'https://example.com')).rejects.toThrow(
      'Ollama timeout',
    );
  });
});

describe('runPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const UNDERSTAND: UnderstandOutput = {
    task_type: 'form',
    detected_fields: ['name', 'email'],
    confidence: 0.9,
  };

  it('calls generateStructured and returns PlanOutput', async () => {
    const output: PlanOutput = {
      fields_to_fill: [
        { field_id: 'name', strategy: 'use profile.name' },
        { field_id: 'email', strategy: 'use profile.email' },
      ],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    };
    mockGenerateStructured.mockResolvedValue(output);

    const result = await runPlan(
      CONFIG,
      WORKFLOW,
      FIELDS,
      UNDERSTAND,
      'Name: Juan\nEmail: j@j.com',
    );
    expect(result).toEqual(output);
  });

  it('caps profileText at 2000 characters in the user prompt', async () => {
    mockGenerateStructured.mockResolvedValue({
      fields_to_fill: [],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    });
    const longProfile = 'x'.repeat(5000);

    await runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, longProfile);

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt.length).toBeLessThan(longProfile.length);
    expect(userPrompt).not.toContain('x'.repeat(2001));
  });

  it('truncates fields to label+type at > 15 fields', async () => {
    const manyFields: FieldSnapshot[] = Array.from({ length: 16 }, (_, i) => ({
      id: `f${i}`,
      label: `Label ${i}`,
      type: 'text',
      currentValue: `val_${i}`,
    }));
    mockGenerateStructured.mockResolvedValue({
      fields_to_fill: [],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    });

    await runPlan(CONFIG, WORKFLOW, manyFields, UNDERSTAND, 'profile');

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).not.toContain('val_0');
  });

  it('throws when generateStructured rejects', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('model error'));

    await expect(runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile')).rejects.toThrow(
      'model error',
    );
  });
});

describe('runDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const PLAN: PlanOutput = {
    fields_to_fill: [
      { field_id: 'name', strategy: 'use profile.name' },
      { field_id: 'email', strategy: 'use profile.email' },
    ],
    missing_fields: [],
    tone: 'professional',
    notes: '',
  };

  it('calls generateStructured and returns DraftOutput', async () => {
    const output: DraftOutput = { name: 'Juan Almeida', email: 'juan@example.com' };
    mockGenerateStructured.mockResolvedValue(output);

    const result = await runDraft(CONFIG, WORKFLOW, FIELDS, PLAN);
    expect(result).toEqual(output);
  });

  it('truncates fields to label+type at > 15 fields', async () => {
    const manyFields: FieldSnapshot[] = Array.from({ length: 16 }, (_, i) => ({
      id: `f${i}`,
      label: `Label ${i}`,
      type: 'text',
      currentValue: `val_${i}`,
    }));
    mockGenerateStructured.mockResolvedValue({});

    await runDraft(CONFIG, WORKFLOW, manyFields, PLAN);

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).not.toContain('val_0');
  });

  it('throws when generateStructured rejects', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('draft failed'));
    await expect(runDraft(CONFIG, WORKFLOW, FIELDS, PLAN)).rejects.toThrow('draft failed');
  });
});

describe('runReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const PLAN: PlanOutput = {
    fields_to_fill: [{ field_id: 'name', strategy: 'use profile.name' }],
    missing_fields: [],
    tone: 'professional',
    notes: '',
  };

  const DRAFT: DraftOutput = { name: 'Juan Almeida', email: 'juan@example.com' };

  it('calls generateStructured and returns ReviewOutput', async () => {
    const output = { name: { revised_value: 'Juan A.', change_reason: 'shortened' } };
    mockGenerateStructured.mockResolvedValue(output);

    const result = await runReview(CONFIG, WORKFLOW, DRAFT, PLAN);
    expect(result).toEqual(output);
  });

  it('includes draft values in the user prompt', async () => {
    mockGenerateStructured.mockResolvedValue({});

    await runReview(CONFIG, WORKFLOW, DRAFT, PLAN);

    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).toContain('Juan Almeida');
  });

  it('throws when generateStructured rejects', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('review failed'));
    await expect(runReview(CONFIG, WORKFLOW, DRAFT, PLAN)).rejects.toThrow('review failed');
  });
});

// ── Sprint 2 ──────────────────────────────────────────────────────────────────

describe('stripThinking', () => {
  it('removes a <thinking>…</thinking> block', () => {
    expect(stripThinking('<thinking>reasoning here</thinking>{"a":1}')).toBe('{"a":1}');
  });

  it('returns raw unchanged when no <thinking> tag is present', () => {
    expect(stripThinking('{"a":1}')).toBe('{"a":1}');
  });

  it('removes multiple <thinking> blocks', () => {
    expect(stripThinking('<thinking>x</thinking>mid<thinking>y</thinking>tail')).toBe('midtail');
  });

  it('returns raw unchanged when closing tag is absent', () => {
    const raw = '<thinking>unclosed';
    expect(stripThinking(raw)).toBe(raw);
  });

  it('handles an empty thinking block', () => {
    expect(stripThinking('<thinking></thinking>result')).toBe('result');
  });
});

describe('runPlan — retry on bad JSON', () => {
  const UNDERSTAND: UnderstandOutput = {
    task_type: 'form',
    detected_fields: ['name'],
    confidence: 0.9,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries once on first parse failure and succeeds on second', async () => {
    const output: PlanOutput = {
      fields_to_fill: [],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    };
    mockGenerateStructured
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: garbage'))
      .mockResolvedValueOnce(output);

    const result = await runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile');
    expect(result).toEqual(output);
    expect(mockGenerateStructured).toHaveBeenCalledTimes(2);
  });

  it('throws on second parse failure and message contains stage name', async () => {
    mockGenerateStructured
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: garbage'))
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: still garbage'));

    await expect(runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile')).rejects.toThrow('plan');
  });

  it('retry prompt contains the original failure hint', async () => {
    const output: PlanOutput = {
      fields_to_fill: [],
      missing_fields: [],
      tone: 'professional',
      notes: '',
    };
    mockGenerateStructured
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: badstuff'))
      .mockResolvedValueOnce(output);

    await runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile');
    const retryUserPrompt = mockGenerateStructured.mock.calls[1]?.[2] as string;
    expect(retryUserPrompt).toContain('badstuff');
  });
});

describe('runPlan — optional feedback and conversation params', () => {
  const UNDERSTAND: UnderstandOutput = {
    task_type: 'form',
    detected_fields: ['name'],
    confidence: 0.9,
  };
  const EMPTY_PLAN: PlanOutput = {
    fields_to_fill: [],
    missing_fields: [],
    tone: 'professional',
    notes: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue(EMPTY_PLAN);
  });

  it('includes feedback text in the user prompt when provided', async () => {
    await runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile', undefined, {
      feedback: 'use formal language',
    });
    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).toContain('use formal language');
  });

  it('includes conversation messages in the user prompt when provided', async () => {
    const conversation: ConversationMessage[] = [
      { sender: 'them', text: 'Hello!' },
      { sender: 'me', text: 'Hi there' },
    ];
    await runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile', undefined, { conversation });
    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).toContain('Hello!');
    expect(userPrompt).toContain('Hi there');
  });

  it('is backwards-compatible: no opts still resolves', async () => {
    await expect(runPlan(CONFIG, WORKFLOW, FIELDS, UNDERSTAND, 'profile')).resolves.toBeDefined();
  });
});

describe('runDraft — retry and feedback', () => {
  const PLAN: PlanOutput = {
    fields_to_fill: [{ field_id: 'name', strategy: 'use profile.name' }],
    missing_fields: [],
    tone: 'professional',
    notes: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries once on first parse failure and succeeds on second', async () => {
    const output: DraftOutput = { name: 'Juan' };
    mockGenerateStructured
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: garbage'))
      .mockResolvedValueOnce(output);

    const result = await runDraft(CONFIG, WORKFLOW, FIELDS, PLAN);
    expect(result).toEqual(output);
    expect(mockGenerateStructured).toHaveBeenCalledTimes(2);
  });

  it('throws on second parse failure and message contains stage name', async () => {
    mockGenerateStructured
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: x'))
      .mockRejectedValueOnce(new Error('Model returned invalid JSON: y'));

    await expect(runDraft(CONFIG, WORKFLOW, FIELDS, PLAN)).rejects.toThrow('draft');
  });

  it('includes feedback text in the user prompt when provided', async () => {
    mockGenerateStructured.mockResolvedValue({ name: 'Juan' });
    await runDraft(CONFIG, WORKFLOW, FIELDS, PLAN, undefined, { feedback: 'be more concise' });
    const [, , userPrompt] = mockGenerateStructured.mock.calls[0] as [unknown, string, string];
    expect(userPrompt).toContain('be more concise');
  });

  it('is backwards-compatible: no opts still resolves', async () => {
    mockGenerateStructured.mockResolvedValue({ name: 'Juan' });
    await expect(runDraft(CONFIG, WORKFLOW, FIELDS, PLAN)).resolves.toBeDefined();
  });
});
