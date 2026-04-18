// TODO: pnpm add -D vitest
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testConnection, listFiles, getFile } from './obsidian';
import type { ObsidianConfig } from '../types';

const BASE_CONFIG: ObsidianConfig = {
  host: 'localhost',
  port: 27123,
  apiKey: 'test-api-key',
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(ok: boolean, body: unknown, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// testConnection
// ---------------------------------------------------------------------------
describe('testConnection', () => {
  it('resolves without throwing when the API returns 200', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, {}));

    await expect(testConnection(BASE_CONFIG)).resolves.toBeUndefined();
  });

  it('sends a GET to the root endpoint', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, {}));

    await testConnection(BASE_CONFIG);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:27123/',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
      }),
    );
  });

  it('throws an error on non-2xx response', async () => {
    mockFetch.mockResolvedValue(makeResponse(false, {}, 401));

    await expect(testConnection(BASE_CONFIG)).rejects.toThrow('401');
  });

  it('uses the configured host and port in the URL', async () => {
    const customConfig: ObsidianConfig = { ...BASE_CONFIG, host: '192.168.1.5', port: 9000 };
    mockFetch.mockResolvedValue(makeResponse(true, {}));

    await testConnection(customConfig);

    expect(mockFetch).toHaveBeenCalledWith('http://192.168.1.5:9000/', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------
describe('listFiles', () => {
  it('returns only .md files from the vault listing', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(true, { files: ['Notes/Foo.md', 'Assets/image.png', 'Bar.md', 'readme.txt'] }),
    );

    const result = await listFiles(BASE_CONFIG);

    expect(result).toEqual(['Notes/Foo.md', 'Bar.md']);
  });

  it('returns an empty array when no .md files exist', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, { files: ['image.png', 'data.csv'] }));

    const result = await listFiles(BASE_CONFIG);

    expect(result).toEqual([]);
  });

  it('sends Authorization header', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, { files: [] }));

    await listFiles(BASE_CONFIG);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
      }),
    );
  });

  it('sends a GET to /vault/', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, { files: [] }));

    await listFiles(BASE_CONFIG);

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:27123/vault/', expect.anything());
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValue(makeResponse(false, {}, 403));

    await expect(listFiles(BASE_CONFIG)).rejects.toThrow('403');
  });
});

// ---------------------------------------------------------------------------
// getFile
// ---------------------------------------------------------------------------
describe('getFile', () => {
  it('returns the markdown text of the file', async () => {
    const markdown = '# My Profile\n\nName: Alice';
    mockFetch.mockResolvedValue(makeResponse(true, markdown));

    const result = await getFile(BASE_CONFIG, 'Profile/Me.md');

    expect(result).toBe(markdown);
  });

  it('encodes the path in the URL', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, ''));

    await getFile(BASE_CONFIG, 'My Notes/File With Spaces.md');

    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('My Notes/File With Spaces.md'));
    expect(calledUrl).not.toContain(' ');
  });

  it('sends Accept: text/markdown header', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, ''));

    await getFile(BASE_CONFIG, 'file.md');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'text/markdown' }),
      }),
    );
  });

  it('sends Authorization header alongside Accept', async () => {
    mockFetch.mockResolvedValue(makeResponse(true, ''));

    await getFile(BASE_CONFIG, 'file.md');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          Accept: 'text/markdown',
        }),
      }),
    );
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValue(makeResponse(false, {}, 404));

    await expect(getFile(BASE_CONFIG, 'missing.md')).rejects.toThrow('404');
  });
});
