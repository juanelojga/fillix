// @vitest-environment jsdom
// buildJobBrief composes extractJobSkills, which parses with DOMParser.
import { describe, it, expect } from 'vitest';
import { buildJobBrief } from '../toptal-job-brief';
import { missingRequiredSkills } from '../job-brief';
import type { CapturedSection } from '../playbook';

const HTML = `<html><body>
  <div data-testid="requiredSkillsWrapper">
    <div aria-disabled="false" data-testid="jobSkillLabel"><span>Python</span></div>
    <div aria-disabled="true" data-testid="jobSkillLabel"><span>Payment APIs</span></div>
  </div>
</body></html>`;

function sections(overrides: Partial<Record<string, CapturedSection>> = {}): CapturedSection[] {
  const base: Record<string, CapturedSection> = {
    'Job Description': {
      heading: 'Job Description',
      body: '📌 [Summary]\nWe are seeking a senior full-stack engineer.\nShow More',
      found: true,
    },
    'Job Attributes': {
      heading: 'Job Attributes',
      body: 'Commitment:\nFull-time (40 hrs/wk)\nTime Zone:\nMadrid, 7 hrs ahead',
      found: true,
    },
  };
  return Object.values({ ...base, ...overrides });
}

describe('buildJobBrief', () => {
  it('routes each decoded section to its own parser', () => {
    const brief = buildJobBrief(sections(), HTML);

    expect(brief.description).toContain('senior full-stack engineer');
    expect(brief.attributes['Time Zone']).toBe('Madrid, 7 hrs ahead');
    expect(brief.skills.required.map((s) => s.name)).toEqual(['Python', 'Payment APIs']);
  });

  // "Show More" is Toptal's control, not content. Left in, it reaches the drafting prompt as
  // a sentence and reads as an instruction.
  it('strips the fold trailer off the description', () => {
    const brief = buildJobBrief(sections(), HTML);

    expect(brief.description).not.toMatch(/Show More/);
    expect(brief.description.endsWith('engineer.')).toBe(true);
  });

  it('names the required skills the profile does not claim', () => {
    expect(missingRequiredSkills(buildJobBrief(sections(), HTML))).toEqual(['Payment APIs']);
  });

  // A Pendo-blocked browser legitimately returns found:false for these two, which is a normal
  // case rather than drift — the brief has to come back usable, not throw.
  it('survives a section that was not found', () => {
    const brief = buildJobBrief(
      sections({
        'Job Description': { heading: 'Job Description', body: '', found: false },
        'Job Attributes': { heading: 'Job Attributes', body: '', found: false },
      }),
      HTML,
    );

    expect(brief.description).toBe('');
    expect(brief.attributes).toEqual({});
    expect(brief.skills.required).toHaveLength(2);
  });

  it('ignores a section whose body survived but whose found flag did not', () => {
    const brief = buildJobBrief(
      sections({
        'Job Attributes': {
          heading: 'Job Attributes',
          body: 'Commitment:\nFull-time',
          found: false,
        },
      }),
      HTML,
    );

    expect(brief.attributes).toEqual({});
  });

  it('returns an empty brief rather than throwing on an empty capture', () => {
    const brief = buildJobBrief([], '<html><body></body></html>');

    expect(brief).toEqual({
      description: '',
      attributes: {},
      skills: { required: [], optional: [] },
    });
  });
});
