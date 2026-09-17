import { describe, it, expect } from 'vitest';
import {
  HTML_CAPTURE_LIMIT,
  describeCaptureSize,
  describeTruncation,
  isTruncated,
  type PageCapture,
} from '../html-budget';

function capture(html: string, totalChars = html.length): PageCapture {
  return { html, totalChars, url: 'https://example.com', title: 'Example', capturedAt: 0 };
}

describe('isTruncated', () => {
  it('is false when the page came back whole', () => {
    expect(isTruncated(capture('<html></html>'))).toBe(false);
  });

  it('is true when the real document was longer than what we kept', () => {
    expect(isTruncated(capture('<html>', 5000))).toBe(true);
  });

  // A page exactly at the cap was not cut: slice(0, limit) returned everything.
  it('is false at exactly the limit', () => {
    const html = 'x'.repeat(HTML_CAPTURE_LIMIT);
    expect(isTruncated(capture(html))).toBe(false);
  });
});

describe('describeCaptureSize', () => {
  it('names one number when the page came back whole', () => {
    expect(describeCaptureSize(capture('x'.repeat(84120)))).toBe('84,120 characters');
  });

  it('names both numbers when truncated', () => {
    expect(describeCaptureSize(capture('x'.repeat(500000), 1284003))).toBe(
      '1,284,003 characters — showing the first 500,000',
    );
  });

  // Thousands separators are hand-rolled precisely so the wording does not shift
  // with the machine's locale.
  it('groups thousands without a locale', () => {
    expect(describeCaptureSize(capture('x'.repeat(999)))).toBe('999 characters');
    expect(describeCaptureSize(capture('x'.repeat(1000)))).toBe('1,000 characters');
  });
});

describe('describeTruncation', () => {
  it('is empty when nothing was dropped', () => {
    expect(describeTruncation(capture('<html></html>'))).toBe('');
  });

  it('states both numbers and why the rest went', () => {
    const notice = describeTruncation(capture('x'.repeat(500000), 1284003));
    expect(notice).toContain('first 500,000');
    expect(notice).toContain('1,284,003');
    expect(notice).toContain('responsive');
  });
});
