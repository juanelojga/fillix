import { describe, it, expect } from 'vitest';
import { diagnoseCaptureFailure } from '../capture-diagnostics';
import type { CaptureFailure } from '../active-tab-html';

const URL = 'https://example.com/a';

const ALL_FAILURES: CaptureFailure[] = [
  { reason: 'no-active-tab' },
  {
    reason: 'restricted-page',
    block: { kind: 'restricted-scheme', scheme: 'chrome:' },
    url: 'chrome://settings',
  },
  {
    reason: 'restricted-page',
    block: { kind: 'web-store' },
    url: 'https://chromewebstore.google.com/',
  },
  { reason: 'restricted-page', block: { kind: 'file-url' }, url: 'file:///tmp/a.html' },
  { reason: 'restricted-page', block: { kind: 'unknown-url' }, url: '' },
  { reason: 'still-loading', url: URL },
  { reason: 'injection-failed', error: 'Cannot access contents of the url', url: URL },
  { reason: 'empty-result', url: URL },
];

describe('diagnoseCaptureFailure', () => {
  // Exhaustive on purpose: adding a reason or a block kind without wording fails here
  // rather than shipping an empty hint.
  it.each(ALL_FAILURES)('words $reason with both a summary and a next step', (failure) => {
    const d = diagnoseCaptureFailure(failure);
    expect(d.summary.length).toBeGreaterThan(0);
    expect(d.hint.length).toBeGreaterThan(0);
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it('keeps the raw Chrome error verbatim', () => {
    const raw = 'Cannot access contents of the url "chrome://extensions/"';
    const d = diagnoseCaptureFailure({ reason: 'injection-failed', error: raw, url: URL });
    expect(d.detail).toBe(raw);
  });

  it('names the blocked scheme so the user can see which page it meant', () => {
    const d = diagnoseCaptureFailure({
      reason: 'restricted-page',
      block: { kind: 'restricted-scheme', scheme: 'devtools:' },
      url: 'devtools://devtools/x',
    });
    expect(d.summary).toContain('devtools:');
    expect(d.detail).toBe('devtools://devtools/x');
  });

  it('tells the user exactly which toggle unlocks file URLs', () => {
    const d = diagnoseCaptureFailure({
      reason: 'restricted-page',
      block: { kind: 'file-url' },
      url: 'file:///tmp/a.html',
    });
    expect(d.hint).toContain('Allow access to file URLs');
  });

  it('tells the user to wait rather than retry blindly while loading', () => {
    expect(diagnoseCaptureFailure({ reason: 'still-loading', url: URL }).hint).toContain('Wait');
  });

  // A failure with no URL must still show something in the mono detail line, or the
  // error block renders an empty row.
  it('falls back to a placeholder when there is no URL to show', () => {
    const d = diagnoseCaptureFailure({
      reason: 'restricted-page',
      block: { kind: 'unknown-url' },
      url: '',
    });
    expect(d.detail).toBe('(no url)');
  });
});
