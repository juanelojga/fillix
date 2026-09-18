import { describe, it, expect } from 'vitest';
import { buildPitchQuery, buildRetrievalQuery } from '../answer-query';
import type { JobBrief } from '../../playbooks/job-brief';

function brief(overrides: Partial<JobBrief> = {}): JobBrief {
  return {
    description: '',
    attributes: {},
    skills: {
      required: [
        { name: 'Python', onProfile: true, connections: 6 },
        { name: 'Payment APIs', onProfile: false, connections: null },
      ],
      optional: [
        { name: 'FastAPI', onProfile: false, connections: null },
        { name: 'Python', onProfile: true, connections: 6 },
      ],
    },
    ...overrides,
  };
}

describe('buildRetrievalQuery', () => {
  /**
   * "What is your experience with their stack?" names no technology at all. On its own it
   * retrieves whichever section happens to be phrased most like a question.
   */
  it('adds the job vocabulary to a question that names nothing', () => {
    const query = buildRetrievalQuery('What is your experience with their stack?', brief());

    expect(query).toContain('What is your experience with their stack?');
    expect(query).toContain('Python');
    expect(query).toContain('FastAPI');
  });

  // The unclaimed ones are the likeliest to retrieve a gaps section, which is exactly the
  // evidence an honest answer needs.
  it('includes the skills the profile does not claim', () => {
    expect(buildRetrievalQuery('q', brief())).toContain('Payment APIs');
  });

  it('does not repeat a skill listed in both groups', () => {
    const query = buildRetrievalQuery('q', brief());

    expect(query.match(/Python/g)).toHaveLength(1);
  });

  it('falls back to the bare question when there is no brief', () => {
    expect(buildRetrievalQuery('Do you speak Spanish?', null)).toBe('Do you speak Spanish?');
  });

  it('falls back to the bare question when the brief listed no skills', () => {
    const empty = brief({ skills: { required: [], optional: [] } });

    expect(buildRetrievalQuery('Do you speak Spanish?', empty)).toBe('Do you speak Spanish?');
  });

  // A real posting lists 30+ chips; embedding all of them drowns the question itself.
  it('caps how much vocabulary it appends', () => {
    const many = brief({
      skills: {
        required: Array.from({ length: 40 }, (_, i) => ({
          name: `Skill${i}`,
          onProfile: false,
          connections: null,
        })),
        optional: [],
      },
    });

    expect(buildRetrievalQuery('q', many).match(/Skill\d+/g)).toHaveLength(25);
  });
});

describe('buildPitchQuery', () => {
  /**
   * A pitch has no question to embed — its field label is a UI string, and embedding it
   * retrieves whichever section reads most like a form field. What it needs is "which of my
   * sections make the best case for this job", so the query is the job itself.
   */
  it('retrieves on the job rather than on any question', () => {
    const query = buildPitchQuery(brief({ description: 'Build robot mission planning tools.' }));

    expect(query).toContain('Build robot mission planning tools.');
    expect(query).toContain('Python');
    expect(query).toContain('FastAPI');
  });

  // Same reason a question includes them: they are the likeliest to retrieve a gaps section.
  it('includes the skills the profile does not claim', () => {
    expect(buildPitchQuery(brief())).toContain('Payment APIs');
  });

  it('does not repeat a skill listed in both groups', () => {
    expect(buildPitchQuery(brief())?.match(/Python/g)).toHaveLength(1);
  });

  // A long posting turns into boilerplate well before the end, and the tail drowns the subject.
  it('takes only the opening of a long description', () => {
    const query = buildPitchQuery(brief({ description: `${'a'.repeat(600)}NEEDLE` }));

    expect(query).not.toContain('NEEDLE');
  });

  it('works from the skills alone when the posting gave no description', () => {
    expect(buildPitchQuery(brief())).toContain('Python');
  });

  /**
   * '' rather than a guess. `topChunks` already returns [] for an empty query vector, and
   * `retrieveProfileContext` words that as a refusal rather than as an empty profile.
   */
  it('gives nothing when there is no brief to retrieve on', () => {
    expect(buildPitchQuery(null)).toBe('');
  });
});
