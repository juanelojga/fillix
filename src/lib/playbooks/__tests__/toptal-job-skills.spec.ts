// @vitest-environment jsdom
// extractJobSkills parses with DOMParser, which node does not have. The panel does.
import { describe, it, expect } from 'vitest';
import { extractJobSkills } from '../toptal-job-skills';

/**
 * Cut from a real capture, trimmed to the attributes the parser reads. The detail that matters:
 * `aria-disabled="true"` is Toptal greying out a skill the user's profile does not claim, and a
 * claimed skill carries a `connectionCount` span *inside* the same label as its name.
 */
function chip(name: string, { onProfile = true, count = null as number | null } = {}): string {
  const countSpan =
    count === null
      ? ''
      : `<span data-testid="connectionCount"><span><svg viewBox="0 0 16 16"><path d="M3 10a3"></path></svg></span><span class="m-0 text-xxs">${count}</span></span>`;
  return `
    <div aria-disabled="${!onProfile}" data-testid="jobSkillLabel">
      <svg viewBox="0 0 16 16"><path d="m8 6.882"></path></svg>
      <span class="flex gap-2 px-3">
        <span class="m-0 text-xxs"><span class="gap-2 items-center flex">${name}${countSpan}</span></span>
      </span>
    </div>`;
}

const PAGE = `<html><body><div data-testid="skillsSection">
  <div data-testid="requiredSkillsWrapper">
    ${chip('Python', { count: 6 })}
    ${chip('Artificial Intelligence (AI)', { count: 1 })}
    ${chip('Next.js', { count: 1 })}
    ${chip('Full-stack Development', { onProfile: false })}
    ${chip('Payment APIs', { onProfile: false })}
    ${chip('Continuous Integration (CI)', { onProfile: false })}
  </div>
  <div data-testid="optionalSkillsWrapper">
    ${chip('PostgreSQL', { count: 3 })}
    ${chip('Square API', { onProfile: false })}
  </div>
</div></body></html>`;

describe('extractJobSkills', () => {
  it('reads both groups, in the order the page lists them', () => {
    const { required, optional } = extractJobSkills(PAGE);

    expect(required.map((s) => s.name)).toEqual([
      'Python',
      'Artificial Intelligence (AI)',
      'Next.js',
      'Full-stack Development',
      'Payment APIs',
      'Continuous Integration (CI)',
    ]);
    expect(optional.map((s) => s.name)).toEqual(['PostgreSQL', 'Square API']);
  });

  // The gaps signal the whole grounding design leans on: a required skill the profile does
  // not claim is the one a drafted answer must not imply experience with.
  it('splits claimed from unclaimed on aria-disabled, not on the text', () => {
    const { required } = extractJobSkills(PAGE);

    expect(required.filter((s) => s.onProfile).map((s) => s.name)).toEqual([
      'Python',
      'Artificial Intelligence (AI)',
      'Next.js',
    ]);
    expect(required.filter((s) => !s.onProfile).map((s) => s.name)).toEqual([
      'Full-stack Development',
      'Payment APIs',
      'Continuous Integration (CI)',
    ]);
  });

  // In the decoded text these read "Next.js1" and "Continuous Integration (CI)", so the only
  // available signal there is "does the line end in a digit" — which would read the 3 in
  // "Web3" as a connection count and silently claim a skill the user does not have.
  it('keeps the name clean of the count, including names that end oddly', () => {
    const { required } = extractJobSkills(PAGE);

    expect(required[1].name).toBe('Artificial Intelligence (AI)');
    expect(required[1].connections).toBe(1);
    expect(required[2].name).toBe('Next.js');
  });

  it('does not read a digit at the end of a skill name as a count', () => {
    const { required } = extractJobSkills(
      `<html><body><div data-testid="requiredSkillsWrapper">${chip('Web3', { onProfile: false })}</div></body></html>`,
    );

    expect(required).toEqual([{ name: 'Web3', onProfile: false, connections: null }]);
  });

  it('carries the count for a claimed skill and null for one without', () => {
    const { required, optional } = extractJobSkills(PAGE);

    expect(required[0]).toEqual({ name: 'Python', onProfile: true, connections: 6 });
    expect(optional[1].connections).toBeNull();
  });

  // Other parsers read the same parsed document afterwards; removing the count node from it
  // rather than from a clone would change what they see.
  it('leaves the parsed document untouched for the next parser', () => {
    extractJobSkills(PAGE);

    const { required } = extractJobSkills(PAGE);
    expect(required[0].connections).toBe(6);
  });

  it('returns empty groups when the skills section is missing', () => {
    expect(extractJobSkills('<html><body><p>Nothing</p></body></html>')).toEqual({
      required: [],
      optional: [],
    });
  });

  it('returns an empty group for a wrapper with no chips', () => {
    const { required, optional } = extractJobSkills(
      '<html><body><div data-testid="requiredSkillsWrapper"></div></body></html>',
    );

    expect(required).toEqual([]);
    expect(optional).toEqual([]);
  });
});
