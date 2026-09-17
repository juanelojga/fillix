import type { CaptureFailure } from './active-tab-html';
import type { InjectionBlock } from './injectable-url';

/**
 * Turns a refusal into a next step. Same shape as `model-test-diagnostics.ts` and
 * `news/summary-diagnostics.ts`: a short worded line, the concrete action to take, and
 * the raw string the browser gave us — never discarded.
 */
export interface CaptureDiagnosis {
  /** One short line naming the cause. */
  summary: string;
  /** The next step to take. */
  hint: string;
  /** The URL or the raw Chrome error, kept verbatim. */
  detail: string;
}

const NO_URL = '(no url)';

function describeBlock(block: InjectionBlock): Pick<CaptureDiagnosis, 'summary' | 'hint'> {
  switch (block.kind) {
    case 'restricted-scheme':
      return {
        summary: `Chrome blocks ${block.scheme} pages`,
        hint: "Extensions are never allowed to read Chrome's own pages. Switch to an http:// or https:// tab and press Capture again.",
      };
    case 'web-store':
      return {
        summary: 'The Chrome Web Store is off limits',
        hint: 'Chrome refuses every extension on Web Store pages, whatever permissions it holds. Switch to any other site and press Capture again.',
      };
    case 'file-url':
      return {
        summary: 'Local files need one more permission',
        hint: 'Open chrome://extensions, find Fillix, and turn on "Allow access to file URLs" — then press Capture again.',
      };
    case 'unknown-url':
      return {
        summary: "Chrome didn't say what this page is",
        hint: 'This tab reports no readable URL, so the capture would be refused. Switch to an http:// or https:// tab and press Capture again.',
      };
  }
}

export function diagnoseCaptureFailure(failure: CaptureFailure): CaptureDiagnosis {
  switch (failure.reason) {
    case 'no-active-tab':
      return {
        summary: 'No page to capture',
        hint: "The side panel couldn't find an active tab in this window. Click the tab you want to capture, then press Capture.",
        detail: 'chrome.tabs.query returned no active tab',
      };

    case 'restricted-page':
      return { ...describeBlock(failure.block), detail: failure.url || NO_URL };

    // Generic on purpose: the mechanism never learns which site a playbook wants, so the
    // playbook supplies the phrase and this only frames it.
    case 'wrong-page':
      return {
        summary: 'This playbook does not read this page',
        hint: `Open ${failure.expected} and press Capture again.`,
        detail: failure.url || NO_URL,
      };

    case 'still-loading':
      return {
        summary: 'The page is still loading',
        hint: 'Capturing now would only get half a document. Wait for the tab to finish loading, then press Capture.',
        detail: failure.url || NO_URL,
      };

    case 'injection-failed':
      return {
        summary: 'Chrome refused to run the capture',
        hint: "This happens on the PDF viewer, on other extensions' pages, and on tabs that navigate mid-capture. Press Capture again, or switch to a normal page.",
        detail: failure.error,
      };

    case 'empty-result':
      return {
        summary: 'The page went away mid-capture',
        hint: 'The tab navigated or closed before the HTML came back. Press Capture again.',
        detail: failure.url || NO_URL,
      };
  }
}
