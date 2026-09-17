import { readableText } from '../capture/readable-text';
import type { CapturedSection } from './playbook';

/**
 * The parts of a Toptal job page worth reading, in the order they are worth reading them.
 *
 * Keyed on Toptal's own `data-testid` / `data-pendoid` hooks rather than class names: the
 * classes are build-hashed (`.j60izt-jss45`, `.heEzOt`) and change on every deploy, while
 * these are the handles their own tests hold.
 */
interface SectionSpec {
  heading: string;
  find: (doc: Document) => Element | null;
}

const bySelector = (selector: string) => (doc: Document) => doc.querySelector(selector);

const SECTIONS: SectionSpec[] = [
  { heading: 'Hiring Status', find: bySelector('[data-testid="jobHiringStatus"]') },
  { heading: 'Job Description', find: bySelector('[data-pendoid="Job.description"]') },
  { heading: 'Job Attributes', find: bySelector('[data-pendoid="Job.attributes"]') },
  { heading: 'Application Questions', find: bySelector('[data-testid="jobQuestionsPreview"]') },
  // The whole section, not its two inner wrappers: "Your profile has 5 out of 11 required
  // skills" sits between them, inside this node and outside both.
  { heading: 'Skills', find: bySelector('[data-testid="skillsSection"]') },
  { heading: 'Company Information', find: bySelector('[data-testid="companyInformationSection"]') },
  {
    heading: 'Job Interest Request',
    // The questions block is the only stable handle inside the application form; the form
    // itself carries the pitch field and the submit step too, so climb to it.
    find: (doc) => {
      const questions = doc.querySelector('[data-testid="matcherQuestions"]');
      return questions?.closest('form') ?? questions;
    },
  },
];

/**
 * Captured markup → the job's sections as text.
 *
 * Parses here rather than in the injected function because the capture runs in the side
 * panel, which is a real document with a `DOMParser` — the service worker has none, and an
 * injected function must close over nothing, which would mean inlining every selector and
 * the whole text walker into one untestable string.
 *
 * A section whose hook is gone comes back `found: false` rather than being dropped: when
 * Toptal reshuffles its markup the panel should name what it lost, not quietly shrink.
 */
export function extractJobSections(html: string): CapturedSection[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  return SECTIONS.map(({ heading, find }) => {
    const el = find(doc);
    if (!el) return { heading, body: '', found: false };
    return { heading, body: readableText(el), found: true };
  });
}
