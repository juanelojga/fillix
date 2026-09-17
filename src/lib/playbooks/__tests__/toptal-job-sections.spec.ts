// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractJobSections } from '../toptal-job-sections';

/**
 * Shaped like the real page: every hook in place, each carrying a word found nowhere
 * else, so a selector that drifts onto a neighbour is caught rather than merely
 * returning something.
 */
const PAGE = `<!doctype html><html><body>
  <div data-testid="jobHiringStatus"><p>Matchers reviewing applications</p></div>
  <div data-testid="jobDetails">
    <div data-pendoid="Job.description"><p>Summary</p><p>Virtual waiter platform</p></div>
    <div data-pendoid="Job.attributes">
      <label><p>Commitment:</p><div>Full-time (40 hrs/wk)</div></label>
      <label><p>Time Zone:</p><div>Madrid, 7 hrs ahead</div></label>
    </div>
  </div>
  <div data-testid="jobQuestionsPreview">
    <ol><li>How soon can you start?</li></ol>
    <div data-testid="matcherQuestionsList"><ol><li>Are you a Spanish speaker?</li></ol></div>
  </div>
  <div data-testid="skillsSection">
    <div data-testid="requiredSkillsMessage">Your profile has 5 out of 11 required skills.</div>
    <div data-testid="requiredSkillsWrapper"><span>Python</span></div>
    <div data-testid="optionalSkillsWrapper"><span>PostgreSQL</span></div>
  </div>
  <div data-testid="companyInformationSection"><p>City / Country:</p><p>Spain</p></div>
  <form>
    <div data-testid="matcherQuestions">
      <label>How soon can you start?</label>
      <input type="hidden" value="Immediately" />
      <input readonly value="Immediately" />
      <textarea></textarea>
      <textarea aria-hidden="true"></textarea>
    </div>
    <button type="submit">Submit Application</button>
  </form>
</body></html>`;

const HEADINGS = [
  'Hiring Status',
  'Job Description',
  'Job Attributes',
  'Application Questions',
  'Skills',
  'Company Information',
  'Job Interest Request',
];

function section(html: string, heading: string) {
  const found = extractJobSections(html).find((s) => s.heading === heading);
  if (!found) throw new Error(`no section named ${heading}`);
  return found;
}

describe('extractJobSections', () => {
  it('returns every section, in reading order', () => {
    expect(extractJobSections(PAGE).map((s) => s.heading)).toEqual(HEADINGS);
  });

  it('finds all of them on a page that has them', () => {
    expect(extractJobSections(PAGE).every((s) => s.found)).toBe(true);
  });

  it.each([
    ['Hiring Status', 'Matchers reviewing applications'],
    ['Job Description', 'Virtual waiter platform'],
    ['Job Attributes', 'Madrid, 7 hrs ahead'],
    ['Application Questions', 'How soon can you start?'],
    ['Skills', 'Python'],
    ['Company Information', 'Spain'],
  ])('reads %s', (heading, text) => {
    expect(section(PAGE, heading).body).toContain(text);
  });

  it('reads the questions hidden behind the collapsed accordion', () => {
    expect(section(PAGE, 'Application Questions').body).toContain('Are you a Spanish speaker?');
  });

  // The "5 out of 11" line sits between the two skill wrappers and inside neither, which
  // is why the section is read whole rather than wrapper by wrapper.
  it('keeps the required-skills match count, which sits between the two wrappers', () => {
    const body = section(PAGE, 'Skills').body;
    expect(body).toContain('5 out of 11');
    expect(body).toContain('PostgreSQL');
  });

  // The questions block is the only stable handle inside the form, so the section climbs
  // to the form to pick up the submit step too.
  it('climbs from the questions block to the whole application form', () => {
    expect(section(PAGE, 'Job Interest Request').body).toContain('Submit Application');
  });

  // The answer is an attribute, not a text node — a plain textContent walk loses it.
  it('shows a pre-filled answer exactly once', () => {
    const body = section(PAGE, 'Job Interest Request').body;
    expect(body.match(/Immediately/g)).toHaveLength(1);
  });

  it('keeps each section clear of its neighbours', () => {
    expect(section(PAGE, 'Company Information').body).not.toContain('Python');
    expect(section(PAGE, 'Hiring Status').body).not.toContain('Summary');
  });

  // These hooks are Toptal's own test and Pendo ids; they can move, and Pendo ids are
  // absent altogether when Pendo is blocked. Naming the loss beats blanking the panel.
  it('names a section it could not find rather than dropping it', () => {
    const sections = extractJobSections('<html><body><p>Some other page</p></body></html>');

    expect(sections.map((s) => s.heading)).toEqual(HEADINGS);
    expect(sections.every((s) => !s.found)).toBe(true);
    expect(sections.every((s) => s.body === '')).toBe(true);
  });
});
