import { HTML_CAPTURE_LIMIT, type PageCapture } from './html-budget';
import { resolveInjectableTab, type CaptureFailure, type PageRequirement } from './injectable-tab';

// Re-exported because this module is the entry point callers already import from, and the
// types describe a refusal that `injectable-tab.ts` now owns rather than one this file adds.
export type { CaptureFailure, PageRequirement } from './injectable-tab';

export type CaptureResult = { ok: true; capture: PageCapture } | ({ ok: false } & CaptureFailure);

/**
 * Runs in the page, not here. `chrome.scripting` stringifies this function, so it has to
 * stay self-contained: no imports, no module-scope constants (the cap arrives through
 * `args`, because a bundled reference resolves to nothing in the page world).
 *
 * Slicing here rather than in the caller is the point — this is the last place before the
 * structured clone, so a 12 MB document never crosses the boundary, only the cap plus an
 * integer for the true length.
 */
export function readDocumentHtml(limit: number): { html: string; totalChars: number } {
  const html = document.documentElement.outerHTML;
  return { html: html.slice(0, limit), totalChars: html.length };
}

/** Never throws: every refusal comes back as a typed failure for the UI to word. */
export async function captureActiveTabHtml(requirement?: PageRequirement): Promise<CaptureResult> {
  const resolved = await resolveInjectableTab(requirement);
  if (!resolved.ok) return resolved;
  const { id, url, title } = resolved.tab;

  let frames: chrome.scripting.InjectionResult<{ html: string; totalChars: number }>[];
  try {
    frames = await chrome.scripting.executeScript({
      // No allFrames: an <iframe>'s outerHTML is not this page's HTML.
      target: { tabId: id },
      func: readDocumentHtml,
      args: [HTML_CAPTURE_LIMIT],
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'injection-failed', error, url };
  }

  // A tab that navigated or crashed mid-injection resolves with an empty array rather
  // than rejecting, so this is a real branch.
  const result = frames?.[0]?.result;
  if (!result) return { ok: false, reason: 'empty-result', url };

  return { ok: true, capture: { ...result, url, title, capturedAt: Date.now() } };
}
