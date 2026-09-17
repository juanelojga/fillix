import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RawCapture from './RawCapture.svelte';
import type { PageCapture } from '$lib/capture/html-budget';

function capture(overrides: Partial<PageCapture> = {}): PageCapture {
  return {
    html: '<html><body><form data-testid="matcherQuestions"></form></body></html>',
    totalChars: 68,
    url: 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA/confirm',
    title: 'Full-Stack Lead Engineer',
    capturedAt: Date.parse('2026-09-16T09:00:00Z'),
    ...overrides,
  };
}

function stubClipboard(writeText: () => Promise<void>): void {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

describe('RawCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('offers a copy button', () => {
    render(RawCapture, { capture: capture() });

    expect(screen.getByRole('button', { name: 'Copy HTML' })).toBeInTheDocument();
  });

  // The header states it a few lines above, in the same scroll container. Saying it twice
  // is noise, and it makes an unqualified getByText ambiguous for every caller's spec.
  it('does not restate the size the header already shows', () => {
    render(RawCapture, { capture: capture({ html: 'x'.repeat(84120), totalChars: 84120 }) });

    expect(screen.queryByText('84,120 characters')).not.toBeInTheDocument();
  });

  // The cap exists so one text node never holds half a megabyte. Rendering the whole
  // capture here would reintroduce exactly that, one layer further down.
  it('previews only the head of the capture, never all of it', () => {
    const html = `<!doctype html>${'y'.repeat(9000)}`;
    const { container } = render(RawCapture, {
      capture: capture({ html, totalChars: html.length }),
    });

    const pre = container.querySelector('pre');
    expect(pre?.textContent).toHaveLength(2000);
    expect(pre?.textContent?.startsWith('<!doctype html>')).toBe(true);
    expect(screen.getByText(/Preview only/)).toBeInTheDocument();
  });

  it('shows no preview notice when the whole capture already fits', () => {
    render(RawCapture, { capture: capture() });

    expect(screen.queryByText(/Preview only/)).not.toBeInTheDocument();
  });

  // Markup lifted off an arbitrary page is text. The point is to read it, not run it.
  it('renders the markup as text, never as HTML', () => {
    const { container } = render(RawCapture, {
      capture: capture({ html: '<h1>Hello</h1>', totalChars: 14 }),
    });

    expect(container.querySelector('pre h1')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe('<h1>Hello</h1>');
  });

  it('puts the whole capture on the clipboard, not the preview', async () => {
    const html = `<!doctype html>${'y'.repeat(9000)}`;
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(RawCapture, { capture: capture({ html, totalChars: html.length }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));

    expect(writeText).toHaveBeenCalledWith(html);
    expect(await screen.findByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
  });

  // Chrome rejects clipboard writes whenever the panel is not the focused surface, which
  // is routine here. A flipped icon would leave the user believing they had the markup.
  it('words a failed copy and keeps the browser error', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('Document is not focused')));

    render(RawCapture, { capture: capture() });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));

    expect(await screen.findByText("Couldn't copy to the clipboard")).toBeInTheDocument();
    expect(screen.getByText(/select the preview below by hand/)).toBeInTheDocument();
    expect(screen.getByText('Document is not focused')).toBeInTheDocument();
  });

  // Absent, not merely rejecting, is a real branch — an unguarded read throws a
  // TypeError that never reaches the failure wording.
  it('words a missing clipboard API rather than throwing', async () => {
    vi.stubGlobal('navigator', {});

    render(RawCapture, { capture: capture() });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));

    expect(await screen.findByText("Couldn't copy to the clipboard")).toBeInTheDocument();
    expect(screen.getByText(/No clipboard API available/)).toBeInTheDocument();
  });

  // The form sits near the bottom of a Toptal job page, so a capped capture is the one
  // case where copying the markup quietly hands over something unusable.
  it('warns that a capped capture may have lost the application form', () => {
    render(RawCapture, {
      capture: capture({ html: 'x'.repeat(500000), totalChars: 1284003 }),
    });

    expect(screen.getByText(/may be missing/)).toBeInTheDocument();
    expect(screen.getByText(/HTML_CAPTURE_LIMIT/)).toBeInTheDocument();
  });

  it('shows no cap warning when the page came back whole', () => {
    render(RawCapture, { capture: capture() });

    expect(screen.queryByText(/may be missing/)).not.toBeInTheDocument();
  });
});
