import { findInjectionBlock, type InjectionBlock } from './injectable-url';
import { HTML_CAPTURE_LIMIT, type PageCapture } from './html-budget';

export type CaptureFailure =
  | { reason: 'no-active-tab' }
  | { reason: 'restricted-page'; block: InjectionBlock; url: string }
  | { reason: 'wrong-page'; url: string; expected: string }
  | { reason: 'still-loading'; url: string }
  | { reason: 'injection-failed'; error: string; url: string }
  | { reason: 'empty-result'; url: string };

/**
 * A playbook's claim on which page it can read. The mechanism knows only *that* a playbook
 * can demand one — never which: the predicate and its wording both come from `playbooks/`.
 */
export interface PageRequirement {
  /** True when the playbook can read the page at `url`. */
  accepts(url: string): boolean;
  /** Named in the refusal: "Open <expected> and press Capture again." */
  expected: string;
}

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
  // `currentWindow` is exact here and only here: the side panel is per-window, so this is
  // the tab the user is looking at. From the service worker there is no current window and
  // it would degrade to "last focused", which is wrong whenever another window has focus.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, reason: 'no-active-tab' };

  const url = tab.url ?? '';
  // First of the pre-flights, ahead of the broader ones: whenever a playbook cannot use
  // this page, "open a Toptal job page" is complete advice, while "Chrome blocks chrome:
  // pages — switch to an http:// tab" is true and still not enough to succeed. Like the
  // restricted-page check it must never reach executeScript: a playbook that cannot use
  // the page has no business reading it.
  if (requirement && !requirement.accepts(url)) {
    return { ok: false, reason: 'wrong-page', url, expected: requirement.expected };
  }

  const block = findInjectionBlock(tab.url);
  if (block) return { ok: false, reason: 'restricted-page', block, url };

  // Chrome will happily inject into a loading page and hand back a half-built DOM, which
  // is silently wrong. Refusing is deterministic and the retry is one click.
  if (tab.status !== 'complete') return { ok: false, reason: 'still-loading', url };

  let frames: chrome.scripting.InjectionResult<{ html: string; totalChars: number }>[];
  try {
    frames = await chrome.scripting.executeScript({
      // No allFrames: an <iframe>'s outerHTML is not this page's HTML.
      target: { tabId: tab.id },
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

  return {
    ok: true,
    capture: { ...result, url, title: tab.title ?? url, capturedAt: Date.now() },
  };
}
