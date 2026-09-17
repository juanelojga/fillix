import { describe, it, expect } from 'vitest';
import { diagnoseEmbedFailure } from '../embed-diagnostics';

const BASE = 'http://localhost:11434';

function diagnose(error: string, model = 'nomic-embed-text') {
  return diagnoseEmbedFailure(error, BASE, model);
}

describe('diagnoseEmbedFailure', () => {
  it('names Ollama not running, with the URL that went unanswered', () => {
    const d = diagnose('Failed to fetch');

    expect(d.cause).toBe('unreachable');
    expect(d.hint).toContain(BASE);
    expect(d.hint).toContain('ollama serve');
  });

  it('names the origin check on a 403, with the variable to set', () => {
    const d = diagnose('Ollama /api/embed returned 403: forbidden');

    expect(d.cause).toBe('origin-blocked');
    expect(d.hint).toContain('OLLAMA_ORIGINS');
  });

  // The failure this whole module exists for: a chat model has no embedding output to give,
  // and "not installed" would be actively misleading for a model that is installed.
  it('tells the user a chat model cannot embed, and what to pull instead', () => {
    const d = diagnose(
      'Ollama /api/embed returned 400: llama3.2 does not support generate embeddings',
      'llama3.2',
    );

    expect(d.cause).toBe('not-an-embed-model');
    expect(d.summary).toContain('llama3.2');
    expect(d.hint).toContain('ollama pull nomic-embed-text');
  });

  // Checked before the generic 404: some Ollama versions report the wrong-model case as a 404
  // carrying this message, and "run ollama pull" would be the wrong next step there.
  it('prefers the wrong-model reading over a bare 404 when the message says so', () => {
    const d = diagnose('Ollama /api/embed returned 404: model does not support embeddings');

    expect(d.cause).toBe('not-an-embed-model');
  });

  it('names a missing model on a plain 404, with the exact pull command', () => {
    const d = diagnose('Ollama /api/embed returned 404: model "nomic-embed-text" not found');

    expect(d.cause).toBe('model-missing');
    expect(d.hint).toContain('ollama pull nomic-embed-text');
    expect(d.hint).toContain('ollama list');
  });

  // Both endpoints 404 means the install predates embeddings entirely — pulling a model
  // would not help, so this must not read as model-missing.
  it('names an Ollama too old to embed at all when the fallback 404s too', () => {
    const d = diagnose('Ollama /api/embeddings returned 404');

    expect(d.cause).toBe('endpoint-missing');
    expect(d.hint).toContain('Upgrade Ollama');
  });

  // The request succeeded and the payload was wrong, which is a different next step from
  // every HTTP failure — and nothing was stored, which the user needs told.
  it('separates a malformed payload from a failed request', () => {
    const d = diagnose('Ollama returned an unusable embedding response: differing sizes');

    expect(d.cause).toBe('bad-response');
    expect(d.hint).toContain('nothing was saved');
  });

  it('names a timeout before reading it as a network failure', () => {
    const d = diagnose('The operation was aborted due to timeout');

    expect(d.cause).toBe('timeout');
    expect(d.hint).toContain('nomic-embed-text');
  });

  it('names a server error', () => {
    expect(diagnose('Ollama /api/embed returned 500').cause).toBe('server-error');
  });

  it('keeps the raw error on every path, including the one it cannot read', () => {
    const errors = [
      'Failed to fetch',
      'Ollama /api/embed returned 403',
      'Ollama /api/embed returned 500',
      'something nobody predicted',
    ];

    for (const error of errors) {
      expect(diagnose(error).detail).toBe(error);
    }
  });

  it('offers no hint rather than a guess when it cannot read the error', () => {
    const d = diagnose('something nobody predicted');

    expect(d.cause).toBe('unknown');
    expect(d.hint).toBe('');
  });
});
