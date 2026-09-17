import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { draftAnswer, normalizeAnswerDraft, DRAFT_NUM_CTX } from '../draft-answer';

describe('normalizeAnswerDraft', () => {
  it('reads the envelope the prompt asks for', () => {
    const draft = normalizeAnswerDraft({
      text: '  I have eight years of Python.  ',
      drew_on: ['Python, FastAPI and Django'],
      gaps: ['Square API'],
    });

    expect(draft).toEqual({
      text: 'I have eight years of Python.',
      drewOn: ['Python, FastAPI and Django'],
      gaps: ['Square API'],
      noExperience: false,
    });
  });

  /**
   * The guard the whole feature turns on. An answer with no cited heading was written out of
   * the model's training rather than out of the profile — the exact fabrication this design
   * exists to prevent, and it arrives looking confident and well-written.
   */
  it('throws away an answer that cites nothing', () => {
    // Untouched by the no-experience allowance: the fixture is a claim, not a denial, so
    // `statesNoExperience` rejects it and the guard fires exactly as it always did.
    expect(() =>
      normalizeAnswerDraft({ text: 'I am a Square API expert.', drew_on: [], gaps: [] }),
    ).toThrow(/without citing your profile/);
  });

  it('throws when drew_on is missing entirely, not just empty', () => {
    expect(() => normalizeAnswerDraft({ text: 'I am an expert.' })).toThrow(
      /without citing your profile/,
    );
  });

  // A tolerated shortfall, no longer the requested outcome: the prompt now asks for a plain
  // statement of having no experience instead. Still accepted rather than thrown, because a
  // blank box is safe and turning it into a hard failure would lose a working screen.
  it('accepts an empty answer with no citations', () => {
    expect(normalizeAnswerDraft({ text: '', drew_on: [], gaps: ['Square API'] })).toEqual({
      text: '',
      drewOn: [],
      gaps: ['Square API'],
      noExperience: false,
    });
  });

  // The point of the whole change: a question the profile cannot answer gets a sentence
  // saying so, not an empty box the user has to notice and fill in themselves.
  it('lets an uncited answer through when it is a plain statement of no experience', () => {
    const draft = normalizeAnswerDraft({
      text: "I don't have experience with the Square API.",
      drew_on: [],
      gaps: ['Square API'],
    });

    expect(draft.text).toBe("I don't have experience with the Square API.");
  });

  it('marks an uncited denial so the card need not re-read the text', () => {
    const draft = normalizeAnswerDraft({
      text: "I don't have experience with the Square API.",
      drew_on: [],
      gaps: [],
    });

    expect(draft.noExperience).toBe(true);
  });

  it('still discards an uncited denial that smuggles in a claim', () => {
    expect(() =>
      normalizeAnswerDraft({
        text: "I don't have Square experience, but I built the checkout at Acme in 2019.",
        drew_on: [],
        gaps: [],
      }),
    ).toThrow(/without citing your profile/);
  });

  // Derived, not reported: a cited answer cannot be flagged as a denial however it is worded.
  it('never marks a cited answer as no-experience', () => {
    const draft = normalizeAnswerDraft({
      text: "I don't have experience with Square.",
      drew_on: ['Payments'],
      gaps: [],
    });

    expect(draft.noExperience).toBe(false);
  });

  it('drops non-string and blank entries rather than rendering them', () => {
    const draft = normalizeAnswerDraft({
      text: 'Answer.',
      drew_on: ['Python', '', '   ', 42, null, 'React'],
      gaps: [{}, 'Square'],
    });

    expect(draft.drewOn).toEqual(['Python', 'React']);
    expect(draft.gaps).toEqual(['Square']);
  });

  it('survives a response with the wrong types throughout', () => {
    expect(normalizeAnswerDraft({ text: 42, drew_on: 'Python', gaps: null })).toEqual({
      text: '',
      drewOn: [],
      gaps: [],
      noExperience: false,
    });
  });
});

describe('draftAnswer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const CONFIG = { baseUrl: 'http://localhost:11434', model: 'qwen3:8b' };
  const INPUT = {
    kind: 'question' as const,
    question: 'Do you know Python?',
    job: 'Commitment: Full-time',
    evidence: '## Python\n\nEight years.',
  };

  function reply(body: unknown) {
    return { ok: true, status: 200, json: async () => ({ response: JSON.stringify(body) }) };
  }

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(reply({ text: 'Eight years of Python.', drew_on: ['Python'], gaps: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the normalized draft', async () => {
    const draft = await draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000));

    expect(draft).toEqual({
      text: 'Eight years of Python.',
      drewOn: ['Python'],
      gaps: [],
      noExperience: false,
    });
  });

  /**
   * Ollama defaults num_ctx to 2048 and truncates from the *start* without reporting it, so an
   * overflow eats the system prompt's anti-invention rules before it eats anything else —
   * leaving a fluent, ungrounded answer and no sign that a rule was ever sent.
   */
  it('asks for a context large enough to hold the prompt it just built', async () => {
    await draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { options?: { num_ctx?: number } };
    expect(body.options?.num_ctx).toBe(DRAFT_NUM_CTX);
    expect(DRAFT_NUM_CTX).toBeGreaterThan(2048);
  });

  it('sends the evidence, and labels it as the only permitted source', async () => {
    await draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { prompt: string; system: string };
    expect(body.prompt).toContain('## Python\n\nEight years.');
    expect(body.prompt).toContain('the only source you may draw on');
    expect(body.system).toContain('Use ONLY the profile excerpts provided');
  });

  // The instruction the always-answer behaviour rests on. If it stops being sent, the model
  // reverts to blanks and nothing else in this file notices.
  it('tells the model never to return an empty answer', async () => {
    await draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000));

    const { system } = JSON.parse(fetchMock.mock.calls[0][1].body) as { system: string };
    expect(system).toContain('Never return an empty "text"');
    expect(system).toContain('saying you do not have that experience');
  });

  // Ollama truncates from the start, so whatever leads is what gets silently dropped. The
  // applicant's own words must be the last thing standing.
  it('puts the evidence after the job description, not before it', async () => {
    await draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000));

    const { prompt } = JSON.parse(fetchMock.mock.calls[0][1].body) as { prompt: string };
    expect(prompt.indexOf('Commitment: Full-time')).toBeLessThan(prompt.indexOf('Eight years.'));
  });

  it('uses the pitch prompt for the pitch, which is a different shape of answer', async () => {
    await draftAnswer(CONFIG, { ...INPUT, kind: 'pitch' }, AbortSignal.timeout(1000));

    const { system } = JSON.parse(fetchMock.mock.calls[0][1].body) as { system: string };
    expect(system).toContain('recruiter');
    expect(system).toContain('paragraphs');
  });

  it('lets the grounding guard reach the caller as a failure', async () => {
    fetchMock.mockResolvedValue(reply({ text: 'I am a Square expert.', drew_on: [] }));

    await expect(draftAnswer(CONFIG, INPUT, AbortSignal.timeout(1000))).rejects.toThrow(
      /without citing your profile/,
    );
  });
});
