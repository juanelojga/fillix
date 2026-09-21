import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../ollama', () => ({ generateStructured: vi.fn() }));

import {
  normalizeNewsSummary,
  summarizeArticle,
  SUMMARY_NUM_CTX,
  SUMMARY_NUM_PREDICT,
} from '../summarizer';
import { generateStructured } from '../../ollama';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };
const INPUT = { title: 'A story', source: 'example.com', text: 'The article body.' };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('summarizeArticle', () => {
  it('passes an abort signal, since generateStructured has no default timeout', async () => {
    vi.mocked(generateStructured).mockResolvedValue({ summary: 'Done.', key_points: [] });
    await summarizeArticle(CONFIG, INPUT, AbortSignal.timeout(1000));

    expect(vi.mocked(generateStructured).mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
  });

  it('includes the title, source and article text in the prompt', async () => {
    vi.mocked(generateStructured).mockResolvedValue({ summary: 'Done.', key_points: [] });
    await summarizeArticle(CONFIG, INPUT, AbortSignal.timeout(1000));

    const userPrompt = vi.mocked(generateStructured).mock.calls[0]?.[2] ?? '';
    expect(userPrompt).toContain('A story');
    expect(userPrompt).toContain('example.com');
    expect(userPrompt).toContain('The article body.');
  });

  /**
   * This path sent no options at all, so it ran at Ollama's 2048-token default — which truncates
   * from the *start*, eating the "use ONLY the article text" rule above before anything else.
   */
  it('asks for a context and an output length instead of inheriting the defaults', async () => {
    vi.mocked(generateStructured).mockResolvedValue({ summary: 'Done.', key_points: [] });
    await summarizeArticle(CONFIG, INPUT, AbortSignal.timeout(1000));

    const options = vi.mocked(generateStructured).mock.calls[0]?.[4];
    expect(options).toEqual({ num_ctx: SUMMARY_NUM_CTX, num_predict: SUMMARY_NUM_PREDICT });
    // fetch-url.ts caps an article at 3,000 characters; the context has to hold that and the prompt.
    expect(SUMMARY_NUM_CTX).toBeGreaterThan(2048);
    expect(SUMMARY_NUM_PREDICT).toBeLessThan(SUMMARY_NUM_CTX);
  });

  it('instructs the model to use only the supplied text', async () => {
    vi.mocked(generateStructured).mockResolvedValue({ summary: 'Done.', key_points: [] });
    await summarizeArticle(CONFIG, INPUT, AbortSignal.timeout(1000));

    const systemPrompt = vi.mocked(generateStructured).mock.calls[0]?.[1] ?? '';
    expect(systemPrompt).toContain('ONLY the article text provided');
  });
});

describe('normalizeNewsSummary', () => {
  // generateStructured's generic is a pure cast over JSON.parse, so this is the only
  // place the real shape is enforced.
  it('throws when summary is missing', () => {
    expect(() => normalizeNewsSummary({})).toThrow('no usable summary');
  });

  it('throws when summary is not a string', () => {
    expect(() => normalizeNewsSummary({ summary: 123 })).toThrow('no usable summary');
  });

  it('throws when summary is blank after trimming', () => {
    expect(() => normalizeNewsSummary({ summary: '   ' })).toThrow('no usable summary');
  });

  it('trims the summary', () => {
    expect(normalizeNewsSummary({ summary: '  Hello.  ' }).summary).toBe('Hello.');
  });

  it('yields no key points when the model returns a string instead of an array', () => {
    expect(normalizeNewsSummary({ summary: 'x', key_points: 'a, b, c' }).keyPoints).toEqual([]);
  });

  it('drops non-string and blank entries', () => {
    const out = normalizeNewsSummary({ summary: 'x', key_points: ['a', 42, '', '  b  '] });
    expect(out.keyPoints).toEqual(['a', 'b']);
  });

  it('caps key points at three', () => {
    const out = normalizeNewsSummary({ summary: 'x', key_points: ['a', 'b', 'c', 'd', 'e'] });
    expect(out.keyPoints).toEqual(['a', 'b', 'c']);
  });
});
