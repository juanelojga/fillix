// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferFieldValueFromMarkdown } from '../ollama';
import type { OllamaConfig, FieldContext } from '../../types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };
const field: FieldContext = { name: 'firstName', label: 'First Name', type: 'text' };
const profileMarkdown = '# John Doe\n\nFirst Name: John\nLast Name: Doe\nEmail: john@example.com';

function mockOllamaResponse(value: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ response: JSON.stringify({ value }) }),
  });
}

describe('inferFieldValueFromMarkdown', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns the extracted value on a well-formed response', async () => {
    mockOllamaResponse('John');
    const result = await inferFieldValueFromMarkdown(config, field, profileMarkdown);
    expect(result).toBe('John');
  });

  it('returns empty string when value key is missing from JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify({}) }),
    });
    const result = await inferFieldValueFromMarkdown(config, field, profileMarkdown);
    expect(result).toBe('');
  });

  it('returns empty string when response JSON is unparseable', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'not json at all' }),
    });
    const result = await inferFieldValueFromMarkdown(config, field, profileMarkdown);
    expect(result).toBe('');
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(inferFieldValueFromMarkdown(config, field, profileMarkdown)).rejects.toThrow(
      'Ollama /api/generate returned 500',
    );
  });

  it('sends a POST to /api/generate with stream: false and format: json', async () => {
    mockOllamaResponse('John');
    await inferFieldValueFromMarkdown(config, field, profileMarkdown);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.model).toBe('llama3.2');
  });

  it('includes the field context in the prompt', async () => {
    mockOllamaResponse('John');
    await inferFieldValueFromMarkdown(config, field, profileMarkdown);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { prompt: string };
    expect(body.prompt).toContain(JSON.stringify(field));
  });

  it('includes the profile markdown in the prompt', async () => {
    mockOllamaResponse('John');
    await inferFieldValueFromMarkdown(config, field, profileMarkdown);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { prompt: string };
    expect(body.prompt).toContain(profileMarkdown);
  });

  it('instructs the model not to invent data', async () => {
    mockOllamaResponse('');
    await inferFieldValueFromMarkdown(config, field, profileMarkdown);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { prompt: string };
    expect(body.prompt.toLowerCase()).toContain('do not invent');
  });
});
