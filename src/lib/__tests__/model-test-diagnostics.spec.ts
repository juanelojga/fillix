import { describe, it, expect } from 'vitest';
import { diagnoseTestFailure } from '../model-test-diagnostics';

const BASE_URL = 'http://localhost:11434';
const MODEL = 'qwen3:8b';

const diagnose = (error: string) => diagnoseTestFailure(error, BASE_URL, MODEL);

describe('diagnoseTestFailure', () => {
  it('classifies a dead server as unreachable and names the base URL tried', () => {
    const result = diagnose('Failed to fetch');
    expect(result.cause).toBe('unreachable');
    expect(result.hint).toContain(BASE_URL);
    expect(result.hint).toContain('ollama serve');
  });

  it('treats a NetworkError the same as a failed fetch', () => {
    expect(diagnose('NetworkError when attempting to fetch resource').cause).toBe('unreachable');
  });

  it('classifies a 403 as a blocked origin and names OLLAMA_ORIGINS', () => {
    const result = diagnose('Ollama /api/chat returned 403: Forbidden');
    expect(result.cause).toBe('origin-blocked');
    expect(result.hint).toContain('OLLAMA_ORIGINS');
  });

  // Verbatim shape of a real Ollama 404 body: {"error":"model 'x' not found"}
  it('classifies a 404 as a missing model and suggests pulling it by name', () => {
    const result = diagnose("Ollama /api/chat returned 404: model 'qwen3:8b' not found");
    expect(result.cause).toBe('model-missing');
    expect(result.summary).toBe('Model not installed');
    expect(result.hint).toContain(`ollama pull ${MODEL}`);
    expect(result.hint).toContain('ollama list');
  });

  it('classifies a bare "not found" body without a status code as a missing model', () => {
    expect(diagnose("model 'qwen3:8b' not found").cause).toBe('model-missing');
  });

  it('classifies a 500 as a server error', () => {
    const result = diagnose('Ollama /api/chat returned 500: something broke');
    expect(result.cause).toBe('server-error');
    expect(result.hint).toContain('ollama serve');
  });

  it('classifies an aborted request as a timeout, not as unreachable', () => {
    const result = diagnose('The operation was aborted due to timeout');
    expect(result.cause).toBe('timeout');
    expect(result.hint).toContain(MODEL);
  });

  it('falls back to unknown without inventing a hint', () => {
    const result = diagnose('something entirely unexpected');
    expect(result.cause).toBe('unknown');
    expect(result.summary).toBe('Test failed');
    expect(result.hint).toBe('');
  });

  it('always preserves the raw error verbatim', () => {
    for (const error of [
      'Failed to fetch',
      'Ollama /api/chat returned 403: Forbidden',
      "Ollama /api/chat returned 404: model 'qwen3:8b' not found",
      'Ollama /api/chat returned 500: something broke',
      'The operation was aborted due to timeout',
      'something entirely unexpected',
    ]) {
      expect(diagnose(error).detail).toBe(error);
    }
  });
});
