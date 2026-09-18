import { describe, it, expect, vi } from 'vitest';
import { assembleAnswerEvidence, EVIDENCE_CHARS } from '../answer-evidence';
import type { EvidenceDeps } from '../answer-evidence';
import { defaultAvailability, type WeeklyAvailability } from '../../profile/availability';
import type { JobBrief } from '../../playbooks/job-brief';

const ZONE = 'America/Guayaquil';
const NOW = new Date('2026-09-17T12:00:00Z');

function hours(): WeeklyAvailability {
  const a = defaultAvailability();
  a.timeZone = ZONE;
  a.days.mon = '9-1';
  a.days.tue = '9-1';
  return a;
}

function brief(): JobBrief {
  return {
    description: 'Build the thing.',
    attributes: { "Client's Hours": '9:00 AM – 5:00 PM', 'Time Zone': 'Madrid, 7 hrs ahead' },
    skills: {
      required: [{ name: 'Python', onProfile: true, connections: 6 }],
      optional: [{ name: 'Square', onProfile: false, connections: null }],
    },
  };
}

function deps(over: Partial<EvidenceDeps> = {}): EvidenceDeps {
  return {
    checkSchedule: vi.fn(async () => null),
    retrieve: vi.fn(async () => ({
      ok: true as const,
      chunks: [
        { heading: 'Python', text: '## Python\n\nEight years.', score: 0.9 },
        { heading: 'React', text: '## React\n\nFour years.', score: 0.7 },
      ],
    })),
    ...over,
  };
}

describe('assembleAnswerEvidence', () => {
  it('joins the excerpts with the separator the panel used to build by hand', async () => {
    const out = await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'Do you know Python?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      deps(),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.evidence).toContain('## Python\n\nEight years.\n\n---\n\n## React');
  });

  it('puts the availability block last, because Ollama truncates from the start', async () => {
    const out = await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'When can you meet?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      deps(),
    );
    if (!out.ok) throw new Error('expected ok');
    expect(out.availabilityBlock).not.toBe('');
    expect(out.evidence.endsWith(out.availabilityBlock)).toBe(true);
    expect(out.evidence.indexOf('## Python')).toBeLessThan(
      out.evidence.indexOf(out.availabilityBlock),
    );
  });

  it('charges the availability block against the budget rather than adding it on top', async () => {
    const d = deps();
    const out = await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'When can you meet?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      d,
    );
    if (!out.ok) throw new Error('expected ok');
    expect(d.retrieve).toHaveBeenCalledWith(
      expect.any(String),
      EVIDENCE_CHARS - out.availabilityBlock.length,
    );
  });

  it('leaves no stray separator when nothing was retrieved', async () => {
    const out = await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'When can you meet?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      deps({ retrieve: vi.fn(async () => ({ ok: true as const, chunks: [] })) }),
    );
    if (!out.ok) throw new Error('expected ok');
    expect(out.evidence).toBe(out.availabilityBlock);
    expect(out.evidence).not.toContain('---\n\n---');
  });

  it('sends no job context when the page gave us no brief', async () => {
    const out = await assembleAnswerEvidence(
      { question: 'q', brief: null, availability: hours(), browserTimeZone: ZONE, now: NOW },
      deps(),
    );
    if (!out.ok) throw new Error('expected ok');
    expect(out.job).toBe('');
  });

  it('passes a retrieval refusal through with the schedule still attached', async () => {
    const check = {
      slots: [],
      recurring: [],
      unchecked: [{ source: 'x', reason: 'no-zone' as const }],
    };
    const out = await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'When can you meet?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      deps({
        checkSchedule: vi.fn(async () => check),
        retrieve: vi.fn(async () => ({ ok: false as const, reason: 'stale-index' as const })),
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure).toEqual({ ok: false, reason: 'stale-index' });
    // Computed before retrieval was asked, so a refusal must not throw it away.
    expect(out.schedule).toBe(check);
  });

  it('uses one clock for the schedule check and the availability block', async () => {
    const d = deps();
    await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'When can you meet?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      d,
    );
    expect(d.checkSchedule).toHaveBeenCalledWith(
      'When can you meet?',
      expect.anything(),
      ZONE,
      NOW,
    );
  });

  /**
   * The routing that makes the pitch worth drafting at all: embedding "Third-person pitch"
   * retrieves whichever section reads most like a form field, which is how a pitch ends up
   * grounded in the wrong half of a CV.
   */
  it('retrieves a pitch on the job, not on its field label', async () => {
    const d = deps();
    await assembleAnswerEvidence(
      {
        kind: 'pitch' as const,
        question: 'Third-person pitch',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      d,
    );

    const query = vi.mocked(d.retrieve).mock.calls[0][0];
    expect(query).toContain('Build the thing.');
    expect(query).toContain('Python');
    expect(query).not.toContain('Third-person pitch');
  });

  it('still retrieves a question on its own words', async () => {
    const d = deps();
    await assembleAnswerEvidence(
      {
        kind: 'question' as const,
        question: 'Do you know Python?',
        brief: brief(),
        availability: hours(),
        browserTimeZone: ZONE,
        now: NOW,
      },
      d,
    );

    expect(vi.mocked(d.retrieve).mock.calls[0][0]).toContain('Do you know Python?');
  });
});
