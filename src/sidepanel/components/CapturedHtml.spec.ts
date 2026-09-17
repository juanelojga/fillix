import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CapturedHtml from './CapturedHtml.svelte';
import type { PageCapture } from '$lib/capture/html-budget';

function capture(overrides: Partial<PageCapture> = {}): PageCapture {
  return {
    html: '<html><h1>Hello</h1></html>',
    totalChars: 27,
    url: 'https://example.com/a',
    title: 'Example Domain',
    capturedAt: Date.parse('2026-09-16T09:00:00Z'),
    ...overrides,
  };
}

describe('CapturedHtml', () => {
  it('names the page and its URL', () => {
    render(CapturedHtml, { capture: capture() });

    expect(screen.getByText('Example Domain')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/a')).toBeInTheDocument();
  });

  // The whole point of the feature: markup from an arbitrary site is text, not DOM.
  it('renders the markup as text, never as HTML', () => {
    const { container } = render(CapturedHtml, { capture: capture() });

    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('<h1>Hello</h1>');
    expect(container.querySelector('pre h1')).toBeNull();
  });

  it('states the size when the page came back whole', () => {
    render(CapturedHtml, { capture: capture({ html: 'x'.repeat(84120), totalChars: 84120 }) });

    expect(screen.getByText('84,120 characters')).toBeInTheDocument();
  });

  it('shows no truncation notice when nothing was dropped', () => {
    render(CapturedHtml, { capture: capture() });

    expect(screen.queryByText(/the rest was dropped/)).not.toBeInTheDocument();
  });

  it('says how much was dropped when the page was capped', () => {
    render(CapturedHtml, { capture: capture({ html: 'x'.repeat(500000), totalChars: 1284003 }) });

    const notice = screen.getByText(/the rest was dropped/);
    expect(notice.textContent).toContain('first 500,000');
    expect(notice.textContent).toContain('1,284,003');
  });

  // Minified HTML has no spaces to wrap on; without break-all one long line gives the
  // whole panel a horizontal scrollbar.
  it('wraps long unbroken markup', () => {
    const { container } = render(CapturedHtml, { capture: capture() });

    expect(container.querySelector('pre')?.className).toContain('break-all');
  });
});
