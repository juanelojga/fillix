import { describe, it, expect } from 'vitest';
import { isToptalJobUrl, TOPTAL_JOB_PAGE } from '../toptal-job-url';

const JOB = 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA';

describe('isToptalJobUrl', () => {
  it.each([`${JOB}/confirm`, JOB, `${JOB}/`, `${JOB}?src=email`, `${JOB}#details`])(
    'accepts %s',
    (url) => {
      expect(isToptalJobUrl(url)).toBe(true);
    },
  );

  // The job id is the whole point: /portal/job/ on its own is the router's dead end with
  // no job on it to read.
  it('rejects the job path with no id', () => {
    expect(isToptalJobUrl('https://talent.toptal.com/portal/job/')).toBe(false);
    expect(isToptalJobUrl('https://talent.toptal.com/portal/job')).toBe(false);
  });

  // Parsed rather than prefix-matched, so a host that merely *starts* with the real one
  // is a different site and is refused.
  it('rejects a look-alike host', () => {
    expect(isToptalJobUrl('https://talent.toptal.com.example.com/portal/job/x')).toBe(false);
  });

  it.each([
    'https://www.toptal.com/portal/job/x',
    'https://talent.toptal.com/portal/jobs/x',
    'https://talent.toptal.com/portal/eligible-jobs',
    'http://talent.toptal.com/portal/job/x',
  ])('rejects %s', (url) => {
    expect(isToptalJobUrl(url)).toBe(false);
  });

  // Chrome hands back tabs with no URL at all, so '' reaches this as a real input.
  it.each(['', 'not a url', 'chrome://extensions'])('rejects %j without throwing', (url) => {
    expect(isToptalJobUrl(url)).toBe(false);
  });
});

describe('TOPTAL_JOB_PAGE', () => {
  it('gates on the same predicate', () => {
    expect(TOPTAL_JOB_PAGE.accepts(`${JOB}/confirm`)).toBe(true);
    expect(TOPTAL_JOB_PAGE.accepts('https://example.com')).toBe(false);
  });

  // The phrase is dropped verbatim into "Open <expected> and press Capture again", so it
  // has to name the address the user must go to.
  it('names the page the user should open', () => {
    expect(TOPTAL_JOB_PAGE.expected).toContain('https://talent.toptal.com/portal/job/');
  });
});
