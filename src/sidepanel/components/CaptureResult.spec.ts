import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CaptureResult from './CaptureResult.svelte';
import type { PageCapture } from '$lib/capture/html-budget';
import type { CapturedSection } from '$lib/playbooks/playbook';

function capture(overrides: Partial<PageCapture> = {}): PageCapture {
  return {
    html: '<html><h1>Hello</h1></html>',
    totalChars: 27,
    url: 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA/confirm',
    title: 'Full-Stack Lead Engineer',
    capturedAt: Date.parse('2026-09-16T09:00:00Z'),
    ...overrides,
  };
}

const SECTIONS: CapturedSection[] = [
  { heading: 'Hiring Status', body: 'Matchers reviewing applications', found: true },
  { heading: 'Job Description', body: 'Summary\nVirtual waiter platform', found: true },
];

function props(sections: CapturedSection[] = SECTIONS, overrides: Partial<PageCapture> = {}) {
  return { capture: capture(overrides), sections };
}

describe('CaptureResult', () => {
  it('names the page and its URL', () => {
    render(CaptureResult, props());

    expect(screen.getByText('Full-Stack Lead Engineer')).toBeInTheDocument();
    expect(screen.getByText(/portal\/job\/VjEtSm9iLTUwNzc5MA/)).toBeInTheDocument();
  });

  // The decoded sections are no longer displayed — the answers are. The job text is already
  // on the page behind the panel, and the wall of it pushed the answer cards off screen.
  it('does not dump the decoded sections', () => {
    render(CaptureResult, props());

    expect(screen.queryByText('Hiring Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Matchers reviewing applications')).not.toBeInTheDocument();
  });

  // The title is lifted off an arbitrary page, so it is text and stays text however the
  // page spells it.
  it('renders page-controlled text as text, never as HTML', () => {
    const { container } = render(CaptureResult, props(SECTIONS, { title: '<h1>Hello</h1>' }));

    expect(screen.getByText('<h1>Hello</h1>')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeNull();
  });

  // Toptal's hooks can move, and the Pendo ones are absent when Pendo is blocked — which
  // quietly empties the brief the drafting runs on. One line, so it is still said out loud.
  it('names every section whose hook it could not find', () => {
    const sections: CapturedSection[] = [
      { heading: 'Hiring Status', body: 'Matchers reviewing applications', found: true },
      { heading: 'Job Description', body: '', found: false },
      { heading: 'Company Information', body: '', found: false },
    ];
    render(CaptureResult, props(sections));

    const notice = screen.getByText(/Not found on this page/);
    expect(notice.textContent).toContain('Job Description');
    expect(notice.textContent).toContain('Company Information');
    expect(notice.textContent).not.toContain('Hiring Status');
  });

  it('says nothing about missing hooks when every section was found', () => {
    render(CaptureResult, props());

    expect(screen.queryByText(/Not found on this page/)).not.toBeInTheDocument();
  });

  it('states the size when the page came back whole', () => {
    render(CaptureResult, props(SECTIONS, { html: 'x'.repeat(84120), totalChars: 84120 }));

    expect(screen.getByText('84,120 characters')).toBeInTheDocument();
  });

  it('shows no truncation notice when nothing was dropped', () => {
    render(CaptureResult, props());

    expect(screen.queryByText(/the rest was dropped/)).not.toBeInTheDocument();
  });

  // A capped capture loses the tail of the document, so the sections near the end come
  // back missing — the banner is what explains why.
  it('says how much was dropped when the page was capped', () => {
    render(CaptureResult, props(SECTIONS, { html: 'x'.repeat(500000), totalChars: 1284003 }));

    const notice = screen.getByText(/the rest was dropped/);
    expect(notice.textContent).toContain('first 500,000');
    expect(notice.textContent).toContain('1,284,003');
  });
});
