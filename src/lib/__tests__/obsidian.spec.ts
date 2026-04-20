// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile, appendToFile } from '../obsidian';
import type { ObsidianConfig } from '../../types';

const config: ObsidianConfig = { host: 'localhost', port: 27123, apiKey: 'test-key' };

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('writeFile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sends a PUT request to /vault/{path}', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await writeFile(config, 'fillix-logs/2026-04-20.md', '# Log');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/vault/');
    expect(opts.method).toBe('PUT');
  });

  it('sets Content-Type to text/markdown', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await writeFile(config, 'test.md', '# Hello');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers?.['Content-Type']).toBe('text/markdown');
  });

  it('sends content as the request body', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await writeFile(config, 'test.md', '# Hello');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.body).toBe('# Hello');
  });

  it('passes AbortSignal for timeout', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await writeFile(config, 'test.md', 'content');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeDefined();
  });

  it('throws on a non-2xx response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(writeFile(config, 'test.md', 'content')).rejects.toThrow();
  });

  it('uses the Authorization header from the config apiKey', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await writeFile(config, 'test.md', 'content');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers?.['Authorization']).toContain('test-key');
  });
});

describe('appendToFile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads the current file content before writing', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => '# Existing' })
      .mockResolvedValueOnce({ ok: true });
    await appendToFile(config, 'log.md', '## New Entry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('writes existing content + newline separator + new content', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => '# Existing' })
      .mockResolvedValueOnce({ ok: true });
    await appendToFile(config, 'log.md', '## New Entry');
    const [, putOpts] = mockFetch.mock.calls[1];
    expect(putOpts.body).toContain('# Existing');
    expect(putOpts.body).toContain('## New Entry');
  });

  it('treats a 404 on read as empty file and writes only the new content', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: true });
    await appendToFile(config, 'new-log.md', '## First Entry');
    const [, putOpts] = mockFetch.mock.calls[1];
    expect(putOpts.body).toContain('## First Entry');
  });

  it('throws on a non-2xx response during the PUT (write) step', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => 'existing' })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(appendToFile(config, 'log.md', 'new content')).rejects.toThrow();
  });
});
