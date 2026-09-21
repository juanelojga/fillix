import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../ollama-embed', () => ({ embedTexts: vi.fn() }));
vi.mock('../../storage', () => ({
  getOllamaConfig: vi.fn(),
  getProfileConfig: vi.fn(),
}));

import { embedQueryDirect } from '../query-embed-direct';
import { embedTexts } from '../../ollama-embed';
import { getOllamaConfig, getProfileConfig } from '../../storage';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOllamaConfig).mockResolvedValue({
    baseUrl: 'http://localhost:11434',
    model: 'chat',
  });
  vi.mocked(getProfileConfig).mockResolvedValue({ embedModel: 'nomic-embed-text' });
});

describe('embedQueryDirect', () => {
  it('embeds with the profile embed model, not the chat model', async () => {
    vi.mocked(embedTexts).mockResolvedValue([[0.5, 0.25]]);

    const result = await embedQueryDirect('Python experience');

    expect(embedTexts).toHaveBeenCalledWith(
      { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' },
      ['Python experience'],
    );
    expect(result).toEqual({ ok: true, vector: [0.5, 0.25] });
  });

  it('reports an Ollama failure as a message rather than throwing', async () => {
    vi.mocked(embedTexts).mockRejectedValue(new Error('Ollama /api/embed returned 404'));

    await expect(embedQueryDirect('anything')).resolves.toEqual({
      ok: false,
      error: 'Ollama /api/embed returned 404',
    });
  });

  it('reports an empty reply rather than handing back an undefined vector', async () => {
    vi.mocked(embedTexts).mockResolvedValue([]);

    const result = await embedQueryDirect('anything');

    expect(result.ok).toBe(false);
  });
});
