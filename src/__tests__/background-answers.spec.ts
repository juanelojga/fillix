import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, MessageResponse } from '../types';

/**
 * The worker side of the Workflows tab's two generations.
 *
 * Both handlers resolve the model as `msg.model ?? config.model`, and that one expression
 * is what lets the panel pick a drafting model without touching the active one. It had no
 * coverage until the picker existed, so a refactor that dropped it would have been silent
 * everywhere except in front of a recruiter.
 */

const mockDraftAnswer = vi.fn();
const mockExtractQuestionTimes = vi.fn();

vi.mock('../lib/ollama', () => ({
  chatStream: vi.fn(),
  testModel: vi.fn(),
  inferFieldValue: vi.fn(),
}));
vi.mock('../lib/legacy-migration', () => ({
  migrateLegacyProviderKeys: vi.fn(),
  removeRetiredSearchKey: vi.fn(),
  removeRetiredObsidianKeys: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  getOllamaConfig: vi
    .fn()
    .mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
  getProfile: vi.fn().mockResolvedValue({ markdown: '', updatedAt: 0 }),
  getProfileConfig: vi.fn().mockResolvedValue({ embedModel: 'nomic-embed-text' }),
  setProfileIndex: vi.fn(),
}));
vi.mock('../lib/answers/draft-answer', () => ({
  draftAnswer: mockDraftAnswer,
  DRAFT_TIMEOUT_MS: 120_000,
}));
vi.mock('../lib/answers/extract-question-times', () => ({
  extractQuestionTimes: mockExtractQuestionTimes,
}));

const messageListeners: ((
  msg: Message,
  sender: { id?: string },
  sendResponse: (r: unknown) => void,
) => void)[] = [];

vi.stubGlobal('chrome', {
  runtime: {
    id: 'fillix-test',
    onMessage: { addListener: vi.fn((cb) => messageListeners.push(cb)) },
    onConnect: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
  },
  sidePanel: { setPanelBehavior: vi.fn() },
});

async function dispatch(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    messageListeners.forEach((cb) =>
      cb(msg, { id: 'fillix-test' }, resolve as (r: unknown) => void),
    );
  });
}

const DRAFT: Message = {
  type: 'DRAFT_ANSWER',
  kind: 'question',
  question: 'Do you know Python?',
  job: 'A job',
  evidence: '## Python\n\nEight years.',
};

const EXTRACT: Message = { type: 'EXTRACT_QUESTION_TIMES', question: 'Tuesday at 5pm CEST?' };

beforeEach(async () => {
  vi.clearAllMocks();
  messageListeners.length = 0;
  vi.resetModules();
  mockDraftAnswer.mockResolvedValue({ text: 'An answer.', drewOn: ['Python'], gaps: [] });
  mockExtractQuestionTimes.mockResolvedValue({ mentions: [] });
  await import('../background');
});

describe('DRAFT_ANSWER', () => {
  it('drafts on the model the panel sent', async () => {
    await dispatch({ ...DRAFT, model: 'phi4' });

    expect(mockDraftAnswer).toHaveBeenCalledWith(
      { baseUrl: 'http://localhost:11434', model: 'phi4' },
      expect.objectContaining({ question: 'Do you know Python?' }),
      expect.any(AbortSignal),
    );
  });

  it('falls back to the active model when none was sent', async () => {
    await dispatch(DRAFT);

    expect(mockDraftAnswer.mock.calls[0]?.[0]).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
  });

  it('returns the draft under its own key', async () => {
    expect(await dispatch(DRAFT)).toEqual({
      ok: true,
      draft: { text: 'An answer.', drewOn: ['Python'], gaps: [] },
    });
  });

  // The grounding guard throws from `normalizeAnswerDraft`; the panel words it from here.
  it('surfaces a rejection as an error response', async () => {
    mockDraftAnswer.mockRejectedValue(
      new Error('The model answered without citing your profile, so the answer was discarded'),
    );

    expect(await dispatch(DRAFT)).toEqual({
      ok: false,
      error: 'The model answered without citing your profile, so the answer was discarded',
    });
  });
});

describe('EXTRACT_QUESTION_TIMES', () => {
  // The same draft runs both generations. Reading the times on one model and answering on
  // another would let the two halves disagree about the same sentence.
  it('extracts on the model the panel sent', async () => {
    await dispatch({ ...EXTRACT, model: 'phi4' });

    expect(mockExtractQuestionTimes).toHaveBeenCalledWith(
      { baseUrl: 'http://localhost:11434', model: 'phi4' },
      'Tuesday at 5pm CEST?',
      expect.any(AbortSignal),
    );
  });

  it('falls back to the active model when none was sent', async () => {
    await dispatch(EXTRACT);

    expect(mockExtractQuestionTimes.mock.calls[0]?.[0]).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
  });

  it('returns the raw times under their own key', async () => {
    expect(await dispatch(EXTRACT)).toEqual({ ok: true, times: { mentions: [] } });
  });
});
