import { describe, it, expect } from 'vitest';
import { diagnosePostFailure } from '../post-diagnostics';

const MODEL = 'gemma4:12b';
const BASE = 'http://localhost:11434';

const diagnose = (error: string, stage: Parameters<typeof diagnosePostFailure>[0] = 'draft') =>
  diagnosePostFailure(stage, error, MODEL, BASE);

describe('diagnosePostFailure', () => {
  /**
   * The failure this exists to prevent, and the reason only line 1 is matched: line 2 is
   * verbatim model output, and here that output is a LinkedIn post — prose about software.
   * A post whose body mentions a request timeout must not be reported as Ollama timing out.
   */
  it('reads the cause off the first line only', () => {
    const error = [
      'The model returned invalid JSON',
      'Last year we fixed a request timeout in the checkout service and never found it again.',
    ].join('\n');
    expect(diagnose(error).cause).toBe('bad-json');
  });

  it('keeps the whole error in detail, including the second line', () => {
    const error = 'The model returned invalid JSON\nraw model output here';
    expect(diagnose(error).detail).toBe(error);
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

  it('names the model in the hint for the arms the model can fix', () => {
    expect(diagnose('Ollama /api/generate returned 404').hint).toContain(MODEL);
  });

  it('treats the two guards as working-as-designed, not as bugs', () => {
    expect(diagnose('The model returned no usable topics', 'topics').cause).toBe('no-topics');
    expect(diagnose('The model returned an unusable angle brief', 'brief').cause).toBe('bad-brief');
  });

  /**
   * Every hint names a button that is on screen at that stage — including the two arms whose
   * real fix is outside the panel, which still have to say what to do once it is fixed. This
   * is `capture-diagnostics.ts`'s discipline: a hint pointing at a control the user cannot
   * see is worse than no hint, and a hint that stops before the retry leaves them guessing.
   */
  it('names the stage-appropriate button in every hint', () => {
    const errors = [
      'The operation timed out',
      'Failed to fetch',
      'Ollama /api/generate returned 404',
      'Ollama /api/generate returned 403',
      'The model returned invalid JSON',
      'Ollama /api/generate returned 500',
      'something nobody has seen',
    ];
    for (const error of errors) {
      expect(diagnose(error, 'topics').hint).toContain('Suggest topics');
      expect(diagnose(error, 'draft').hint).toContain('Regenerate');
    }
  });

  it('never tells a research failure to check ollama serve', () => {
    const d = diagnose('Failed to fetch', 'research');
    expect(d.summary).toBe("Can't reach the search services");
    expect(d.hint).not.toMatch(/ollama serve/i);
  });

  it('points the research context at the search hosts, not /api/generate', () => {
    expect(diagnose('Failed to fetch', 'research').context).toContain('api.tavily.com');
    expect(diagnose('Failed to fetch', 'draft').context).toContain('/api/generate');
  });

  it('carries the stage it was given rather than inferring one', () => {
    expect(diagnose('Failed to fetch', 'audit').stage).toBe('audit');
  });
});
