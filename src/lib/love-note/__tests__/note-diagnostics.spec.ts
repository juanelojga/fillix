import { describe, it, expect } from 'vitest';
import { diagnoseNoteFailure } from '../note-diagnostics';

const MODEL = 'gemma4:12b';
const BASE = 'http://localhost:11434';

const diagnose = (error: string) => diagnoseNoteFailure(error, MODEL, BASE);

describe('diagnoseNoteFailure', () => {
  /**
   * Line 2 is verbatim model output, and here that output is a message to someone — which
   * can say anything. One that mentions waiting too long must not read as Ollama timing out.
   */
  it('reads the cause off the first line only', () => {
    const error = [
      'The model returned invalid JSON',
      'Perdón por el timeout de ayer, se me fue el internet.',
    ].join('\n');
    expect(diagnose(error).cause).toBe('bad-json');
  });

  it('keeps the whole error in detail, including the second line', () => {
    const error = 'The model returned invalid JSON\nraw model output here';
    expect(diagnose(error).detail).toBe(error);
  });

  it('treats the guard as working-as-designed, and checks it first', () => {
    expect(diagnose('The model returned no usable messages').cause).toBe('no-messages');
  });

  /** The one next step outside the panel: a worker still on the build before this playbook. */
  it('tells the user to reload the extension when the worker does not know the message', () => {
    const d = diagnose('Unknown message type: NOTE_WRITE');
    expect(d.cause).toBe('stale-worker');
    expect(d.hint).toContain('chrome://extensions');
    expect(d.hint).toContain('Write messages');
  });

  it('reports a truncated reply before claiming it was malformed', () => {
    expect(diagnose('The reply was cut off before it finished').cause).toBe('truncated');
  });

  it('reports a timeout before an unreachable host — an aborted fetch reads as both', () => {
    expect(diagnose('The operation timed out').cause).toBe('timeout');
    expect(diagnose('Failed to fetch').cause).toBe('unreachable');
  });

  it('has no catch-all 4xx arm, so an unseen status keeps its own detail', () => {
    const d = diagnose('Ollama /api/generate returned 418');
    expect(d.cause).toBe('unknown');
    expect(d.detail).toContain('418');
  });

  it('names the model and the endpoint in the context', () => {
    const d = diagnose('Failed to fetch');
    expect(d.context).toContain(MODEL);
    expect(d.context).toContain(`${BASE}/api/generate`);
  });

  /**
   * Every hint names the one button `note-status.ts` puts on screen — never the composer's
   * "Regenerate" or the capture's "Capture", which are not there when this is shown.
   */
  it('names Write messages in every hint, and no other playbook button', () => {
    const errors = [
      'The model returned no usable messages',
      'Unknown message type: NOTE_WRITE',
      'The operation timed out',
      'Failed to fetch',
      'Ollama /api/generate returned 403',
      'Ollama /api/generate returned 404',
      'The reply was cut off before it finished',
      'The model returned invalid JSON',
      'The model returned an empty response',
      'Ollama /api/generate returned 500',
      'something nobody has seen',
    ];
    for (const error of errors) {
      const { hint } = diagnose(error);
      expect(hint).toContain('Write messages');
      expect(hint).not.toMatch(/captur/i);
      expect(hint).not.toMatch(/suggest topics/i);
    }
  });
});
