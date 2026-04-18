import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/storage', () => ({
  getOllamaConfig: vi.fn(async () => ({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })),
  getObsidianConfig: vi.fn(async () => ({ host: 'localhost', port: 27123, apiKey: '' })),
}));

vi.mock('../lib/ollama', () => ({
  inferFieldValue: vi.fn(async () => 'inferred-value'),
  listModels: vi.fn(async () => []),
  chatStream: vi.fn(),
}));

vi.mock('../lib/obsidian', () => ({
  getFile: vi.fn(async () => ''),
  listFiles: vi.fn(async () => []),
  testConnection: vi.fn(async () => undefined),
}));

import { getOllamaConfig } from '../lib/storage';
import { inferFieldValue } from '../lib/ollama';

const field = { name: 'email', label: 'Email', type: 'text' };

async function simulateOllamaInfer() {
  const ollamaConfig = await getOllamaConfig();
  const value = await inferFieldValue(ollamaConfig, field);
  return { ok: true, value };
}

describe('OLLAMA_INFER handler', () => {
  beforeEach(() => {
    vi.mocked(inferFieldValue).mockReset();
    vi.mocked(inferFieldValue).mockResolvedValue('inferred-value');
  });

  it('calls inferFieldValue and returns the value', async () => {
    const result = await simulateOllamaInfer();

    expect(inferFieldValue).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, value: 'inferred-value' });
  });

  it('passes the field context to inferFieldValue', async () => {
    await simulateOllamaInfer();

    expect(inferFieldValue).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:11434' }),
      field,
    );
  });
});
