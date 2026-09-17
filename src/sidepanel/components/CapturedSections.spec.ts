import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CapturedSections from './CapturedSections.svelte';
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

describe('CapturedSections', () => {
  it('names the page and its URL', () => {
    render(CapturedSections, props());

    expect(screen.getByText('Full-Stack Lead Engineer')).toBeInTheDocument();
    expect(screen.getByText(/portal\/job\/VjEtSm9iLTUwNzc5MA/)).toBeInTheDocument();
  });

  it('shows every section under its own heading', () => {
    render(CapturedSections, props());

    expect(screen.getByText('Hiring Status')).toBeInTheDocument();
    expect(screen.getByText('Matchers reviewing applications')).toBeInTheDocument();
    expect(screen.getByText('Job Description')).toBeInTheDocument();
  });

  // Text lifted off an arbitrary page is text, not DOM — the requirement does not relax
  // just because the capture is decoded now. A body can still hold literal markup.
  it('renders a section body as text, never as HTML', () => {
    const sections = [{ heading: 'Job Description', body: '<h1>Hello</h1>', found: true }];
    const { container } = render(CapturedSections, props(sections));

    expect(screen.getByText('<h1>Hello</h1>')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeNull();
  });

  // The walker puts one line per block, so the newlines are the structure.
  it('keeps the line breaks the decoder put in', () => {
    const { container } = render(CapturedSections, props());

    const body = Array.from(container.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Virtual waiter platform'),
    );
    expect(body?.className).toContain('whitespace-pre-wrap');
  });

  // Toptal's hooks can move, and the Pendo ones are absent when Pendo is blocked. Naming
  // the loss is the whole reason the section is kept rather than dropped.
  it('words a section it could not find instead of leaving a gap', () => {
    const sections = [{ heading: 'Company Information', body: '', found: false }];
    render(CapturedSections, props(sections));

    expect(screen.getByText('Company Information')).toBeInTheDocument();
    expect(screen.getByText(/Not found on this page/)).toBeInTheDocument();
  });

  it('states the size when the page came back whole', () => {
    render(CapturedSections, props(SECTIONS, { html: 'x'.repeat(84120), totalChars: 84120 }));

    expect(screen.getByText('84,120 characters')).toBeInTheDocument();
  });

  it('shows no truncation notice when nothing was dropped', () => {
    render(CapturedSections, props());

    expect(screen.queryByText(/the rest was dropped/)).not.toBeInTheDocument();
  });

  // A capped capture loses the tail of the document, so the sections near the end come
  // back missing — the banner is what explains why.
  it('says how much was dropped when the page was capped', () => {
    render(CapturedSections, props(SECTIONS, { html: 'x'.repeat(500000), totalChars: 1284003 }));

    const notice = screen.getByText(/the rest was dropped/);
    expect(notice.textContent).toContain('first 500,000');
    expect(notice.textContent).toContain('1,284,003');
  });
});
