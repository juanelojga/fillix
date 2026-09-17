import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedTexts, testEmbedModel } from '../ollama-embed';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' };

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function notOk(status: number, body = ''): Response {
  return { ok: false, status, text: async () => body, json: async () => ({}) } as Response;
}

describe('embedTexts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('batches every input into one /api/embed call', async () => {
    fetchMock.mockResolvedValue(
      ok({
        embeddings: [
          [1, 2],
          [3, 4],
        ],
      }),
    );

    const vectors = await embedTexts(CONFIG, ['a', 'b']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    expect(JSON.parse(init.body)).toEqual({ model: 'nomic-embed-text', input: ['a', 'b'] });
    expect(vectors).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('never calls out at all for an empty input list', async () => {
    expect(await embedTexts(CONFIG, [])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // /api/embed arrived in Ollama 0.3; a working install can predate it, and the failure is
  // otherwise a bare 404 the user has no way to read.
  it('falls back to the older singular endpoint on a 404', async () => {
    fetchMock
      .mockResolvedValueOnce(notOk(404))
      .mockResolvedValueOnce(ok({ embedding: [1, 2] }))
      .mockResolvedValueOnce(ok({ embedding: [3, 4] }));

    const vectors = await embedTexts(CONFIG, ['a', 'b']);

    expect(vectors).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/api/embeddings');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      model: 'nomic-embed-text',
      prompt: 'a',
    });
  });

  it('reports the old endpoint by name when it fails too', async () => {
    fetchMock.mockResolvedValueOnce(notOk(404)).mockResolvedValueOnce(notOk(404));

    await expect(embedTexts(CONFIG, ['a'])).rejects.toThrow(/\/api\/embeddings returned 404/);
  });

  it("keeps Ollama's own error message on an HTTP failure", async () => {
    fetchMock.mockResolvedValue(
      notOk(400, JSON.stringify({ error: 'does not support embeddings' })),
    );

    await expect(embedTexts(CONFIG, ['a'])).rejects.toThrow(
      'Ollama /api/embed returned 400: does not support embeddings',
    );
  });

  describe('a malformed response', () => {
    // Every one of these produces an index that scores all queries identically, which reads
    // as a bad model rather than bad data — and by then the vectors are already in storage.
    it('rejects a row count that does not match the inputs', async () => {
      fetchMock.mockResolvedValue(ok({ embeddings: [[1, 2]] }));

      await expect(embedTexts(CONFIG, ['a', 'b'])).rejects.toThrow(/expected 2 embeddings, got 1/);
    });

    it('rejects a missing embeddings field', async () => {
      fetchMock.mockResolvedValue(ok({}));

      await expect(embedTexts(CONFIG, ['a'])).rejects.toThrow(/unusable embedding response/);
    });

    it('rejects a row that is not numbers', async () => {
      fetchMock.mockResolvedValue(ok({ embeddings: [[1, null]] }));

      await expect(embedTexts(CONFIG, ['a'])).rejects.toThrow(/not a list of numbers/);
    });

    it('rejects an empty vector', async () => {
      fetchMock.mockResolvedValue(ok({ embeddings: [[]] }));

      await expect(embedTexts(CONFIG, ['a'])).rejects.toThrow(/not a list of numbers/);
    });

    it('rejects rows of differing widths', async () => {
      fetchMock.mockResolvedValue(ok({ embeddings: [[1, 2], [3]] }));

      await expect(embedTexts(CONFIG, ['a', 'b'])).rejects.toThrow(/differing sizes/);
    });
  });
});

describe('testEmbedModel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ embeddings: [[1, 2]] })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Not testModel(): that POSTs /api/chat, which an embed-only model rejects outright, so it
  // would report "not installed" for a model that is installed and working.
  it('verifies the model through the embeddings endpoint, never /api/chat', async () => {
    await testEmbedModel(CONFIG);

    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['http://localhost:11434/api/embed']);
  });

  it('returns a latency', async () => {
    expect(await testEmbedModel(CONFIG)).toBeGreaterThanOrEqual(0);
  });
});
