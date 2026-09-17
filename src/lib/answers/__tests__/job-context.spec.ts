import { describe, it, expect } from 'vitest';
import { buildJobContext } from '../job-context';
import type { JobBrief } from '../../playbooks/job-brief';

function brief(overrides: Partial<JobBrief> = {}): JobBrief {
  return {
    description: 'We are seeking a senior full-stack engineer.',
    attributes: { Commitment: 'Full-time (40 hrs/wk)', 'Time Zone': 'Madrid, 7 hrs ahead' },
    skills: {
      required: [
        { name: 'Python', onProfile: true, connections: 6 },
        { name: 'Payment APIs', onProfile: false, connections: null },
        { name: 'Square', onProfile: false, connections: null },
      ],
      optional: [],
    },
    ...overrides,
  };
}

describe('buildJobContext', () => {
  it('carries the attributes as labelled facts', () => {
    const context = buildJobContext(brief());

    expect(context).toContain('Commitment: Full-time (40 hrs/wk)');
    expect(context).toContain('Time Zone: Madrid, 7 hrs ahead');
  });

  /**
   * Named explicitly rather than left to be inferred from an absence: the model is being asked
   * not to claim these, and "not mentioned in the excerpts" is a far weaker instruction than a
   * list under a heading that says never.
   */
  it('names the unclaimed skills as the ones never to imply', () => {
    const context = buildJobContext(brief());

    expect(context).toMatch(
      /do NOT list — never imply experience with these: Payment APIs, Square/,
    );
  });

  it('separates the claimed skills from the unclaimed ones', () => {
    const context = buildJobContext(brief());

    expect(context).toContain('Required skills you already list: Python');
  });

  it('includes the description under its own heading', () => {
    expect(buildJobContext(brief())).toContain('Job description:\nWe are seeking');
  });

  describe('the budget', () => {
    const long = brief({ description: `${'word '.repeat(3000)}` });

    it('truncates the description rather than the facts', () => {
      const context = buildJobContext(long, 1000);

      expect(context.length).toBeLessThan(1200);
      expect(context).toContain('Commitment: Full-time (40 hrs/wk)');
      expect(context).toContain('never imply experience with these');
    });

    it('marks where it cut', () => {
      expect(buildJobContext(long, 1000)).toMatch(/…$/);
    });

    // Handing the model half a sentence invites it to finish the sentence.
    it('cuts at a line break when there is one in range', () => {
      const lines = brief({ description: `${'a'.repeat(400)}\n${'b'.repeat(400)}\ntail` });

      const context = buildJobContext(lines, 700);

      expect(context).not.toContain('bbbb');
    });

    it('leaves a short description whole', () => {
      expect(buildJobContext(brief())).not.toMatch(/…/);
    });
  });

  it('omits a section the brief had nothing for', () => {
    const bare = brief({ attributes: {}, skills: { required: [], optional: [] } });

    expect(buildJobContext(bare)).toBe(
      'Job description:\nWe are seeking a senior full-stack engineer.',
    );
  });

  it('returns just the facts when there is no description', () => {
    const noDescription = buildJobContext(brief({ description: '' }));

    expect(noDescription).toContain('Commitment');
    expect(noDescription).not.toContain('Job description:');
  });
});
