/**
 * How much page markup the panel keeps, and how it says so.
 *
 * Characters, not bytes: this is what crosses `executeScript`'s structured clone and
 * then becomes one text node in a <pre>. Most real pages land between 100k and 800k,
 * so the majority of captures come back whole; past ~1M the layout pass alone makes
 * the panel janky and the string is held for the life of the session.
 */
export const HTML_CAPTURE_LIMIT = 500_000;

export interface PageCapture {
  /** Raw page markup, capped at HTML_CAPTURE_LIMIT. Rendered as text, never as HTML. */
  html: string;
  /** Length of the real outerHTML before the cap, so truncation can be stated exactly. */
  totalChars: number;
  url: string;
  title: string;
  capturedAt: number;
}

export function isTruncated(capture: PageCapture): boolean {
  return capture.totalChars > capture.html.length;
}

/** Thousands separators without pulling in a locale — the wording must be stable. */
function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '84,120 characters' · '1,284,003 characters — showing the first 500,000'. */
export function describeCaptureSize(capture: PageCapture): string {
  const total = `${group(capture.totalChars)} characters`;
  if (!isTruncated(capture)) return total;
  return `${total} — showing the first ${group(capture.html.length)}`;
}

/** The amber notice above a capped capture. Empty when the page came back whole. */
export function describeTruncation(capture: PageCapture): string {
  if (!isTruncated(capture)) return '';
  return (
    `Showing the first ${group(capture.html.length)} of ${group(capture.totalChars)} ` +
    'characters — the rest was dropped so the panel stays responsive.'
  );
}
