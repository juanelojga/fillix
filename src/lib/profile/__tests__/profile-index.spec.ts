import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProfileIndex, EmptyProfileError } from '../profile-index';
import { isIndexStale } from '../index-staleness';
import { hashProfile } from '../profile-hash';

const MARKDOWN = '## Python\n\nEight years.\n\n## React\n\nSix years.';

describe('buildProfileIndex', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [
          [0.1234567891, 0.5],
          [0.25, 0.75],
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds one vector per chunk and keeps them in order', async () => {
    const index = await buildProfileIndex('http://localhost:11434', 'nomic', MARKDOWN);

    expect(index.chunks.map((c) => c.heading)).toEqual(['Python', 'React']);
    expect(index.chunks[1].vector).toEqual([0.25, 0.75]);
    expect(index.dim).toBe(2);
  });

  it('records what it was built from, so staleness can be decided later', async () => {
    const index = await buildProfileIndex('http://localhost:11434', 'nomic', MARKDOWN);

    expect(index.model).toBe('nomic');
    expect(index.chars).toBe(MARKDOWN.length);
    expect(index.hash).toBe(hashProfile(MARKDOWN, 'nomic'));
    expect(isIndexStale(index, MARKDOWN, 'nomic')).toBe(false);
  });

  // ~20 JSON characters per raw float against 9 rounded is the difference between ~600 KB and
  // ~275 KB of a 10 MB quota shared with the news cache; cosine is unaffected at 1e-6.
  it('rounds the stored vectors to six decimals', async () => {
    const index = await buildProfileIndex('http://localhost:11434', 'nomic', MARKDOWN);

    expect(index.chunks[0].vector[0]).toBe(0.123457);
  });

  it('sends the chunk text, heading included, to be embedded', async () => {
    await buildProfileIndex('http://localhost:11434', 'nomic', MARKDOWN);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { input: string[] };
    expect(body.input[0]).toBe('## Python\n\nEight years.');
  });

  // An empty profile is not a failure, but it is also not an index — and an index of nothing
  // would read as fresh and quietly ground every answer in no evidence at all.
  it('refuses an empty profile in words, without calling Ollama', async () => {
    await expect(buildProfileIndex('http://localhost:11434', 'nomic', '  ')).rejects.toThrow(
      EmptyProfileError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets an embedding failure through rather than storing a partial index', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(buildProfileIndex('http://localhost:11434', 'nomic', MARKDOWN)).rejects.toThrow();
  });
});
