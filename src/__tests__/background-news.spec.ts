import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, MessageResponse, NewsItem } from '../types';

const mockRefreshNews = vi.fn();
const mockResolveArticleText = vi.fn();
const mockSummarizeArticle = vi.fn();

vi.mock('../lib/ollama', () => ({
  chatStream: vi.fn(),
  testModel: vi.fn(),
  inferFieldValue: vi.fn(),
}));
vi.mock('../lib/legacy-migration', () => ({
  migrateLegacyProviderKeys: vi.fn(),
  removeRetiredSearchKey: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  getOllamaConfig: vi
    .fn()
    .mockResolvedValue({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
  getChatConfig: vi.fn().mockResolvedValue({ systemPrompt: '' }),
  getObsidianConfig: vi.fn().mockResolvedValue({ host: 'localhost', port: 27123, apiKey: '' }),
  getModelList: vi.fn().mockResolvedValue([]),
  getWorkflows: vi.fn().mockResolvedValue([]),
  getWorkflowsFolder: vi.fn().mockResolvedValue('fillix-workflows'),
  setWorkflows: vi.fn(),
}));
vi.mock('../lib/news/aggregator', () => ({ refreshNews: mockRefreshNews }));
vi.mock('../lib/news/article-text', () => ({
  resolveArticleText: mockResolveArticleText,
  articleFailureMessage: (reason: string) =>
    reason === 'fetch-failed' ? 'Could not fetch this article' : 'too little readable text',
}));
vi.mock('../lib/news/summarizer', () => ({
  summarizeArticle: mockSummarizeArticle,
  SUMMARY_TIMEOUT_MS: 60_000,
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

const ITEM: NewsItem = {
  id: 'hn:1',
  category: 'ai',
  title: 'A story',
  url: 'https://example.com/story',
  source: 'example.com',
  meta: '1 point',
  publishedAt: '2026-09-16T09:00:00Z',
  snippet: '',
};

/** Drives the real onMessage listener and resolves with what it sends back. */
async function dispatch(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    messageListeners.forEach((cb) =>
      cb(msg, { id: 'fillix-test' }, resolve as (r: unknown) => void),
    );
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  messageListeners.length = 0;
  vi.resetModules();
  await import('../background');
});

describe('NEWS_REFRESH', () => {
  it('returns items and degraded sources under their own keys', async () => {
    const degraded = [{ category: 'technology' as const, source: 'Hacker News', error: 'down' }];
    mockRefreshNews.mockResolvedValue({ items: [ITEM], degraded });

    expect(await dispatch({ type: 'NEWS_REFRESH' })).toEqual({
      ok: true,
      news: [ITEM],
      degraded,
    });
  });

  it('converts a total failure into an error response', async () => {
    mockRefreshNews.mockRejectedValue(new Error('No news sources responded (Hacker News)'));

    expect(await dispatch({ type: 'NEWS_REFRESH' })).toEqual({
      ok: false,
      error: 'No news sources responded (Hacker News)',
    });
  });
});

describe('NEWS_ARTICLE', () => {
  it('returns the resolved text and where it came from', async () => {
    mockResolveArticleText.mockResolvedValue({ ok: true, text: 'body', origin: 'article' });

    expect(await dispatch({ type: 'NEWS_ARTICLE', item: ITEM })).toEqual({
      ok: true,
      article: { text: 'body', origin: 'article' },
    });
    expect(mockResolveArticleText).toHaveBeenCalledWith(ITEM);
  });

  it('turns unusable text into a worded error rather than summarizing it', async () => {
    mockResolveArticleText.mockResolvedValue({ ok: false, reason: 'fetch-failed' });

    expect(await dispatch({ type: 'NEWS_ARTICLE', item: ITEM })).toEqual({
      ok: false,
      error: 'Could not fetch this article',
    });
  });
});

describe('NEWS_SUMMARIZE', () => {
  it('passes the article through and returns the summary', async () => {
    const summary = { summary: 'It happened.', keyPoints: ['a'] };
    mockSummarizeArticle.mockResolvedValue(summary);

    const response = await dispatch({
      type: 'NEWS_SUMMARIZE',
      title: 'A story',
      source: 'example.com',
      text: 'body',
    });

    expect(response).toEqual({ ok: true, summary });
    expect(mockSummarizeArticle.mock.calls[0]?.[1]).toEqual({
      title: 'A story',
      source: 'example.com',
      text: 'body',
    });
  });

  // generateStructured has no default timeout, so the worker must always supply one.
  it('always supplies an abort signal', async () => {
    mockSummarizeArticle.mockResolvedValue({ summary: 'x', keyPoints: [] });

    await dispatch({ type: 'NEWS_SUMMARIZE', title: 't', source: 's', text: 'b' });

    expect(mockSummarizeArticle.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
  });

  it('surfaces a generation failure as an error response', async () => {
    mockSummarizeArticle.mockRejectedValue(new Error('Model returned no usable summary'));

    expect(await dispatch({ type: 'NEWS_SUMMARIZE', title: 't', source: 's', text: 'b' })).toEqual({
      ok: false,
      error: 'Model returned no usable summary',
    });
  });
});
