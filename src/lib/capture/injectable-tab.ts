import { findInjectionBlock, type InjectionBlock } from './injectable-url';

/**
 * Which tab a run acts on, and every reason it might refuse.
 *
 * Lifted out of `active-tab-html.ts` when a second caller appeared: reading the page and
 * writing to it need the *same* pre-flight in the *same* order, and the order is load-bearing
 * (see below). A second copy would drift, and the drift would be silent.
 */

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

export interface InjectableTab {
  id: number;
  url: string;
  title: string;
}

export type InjectableTabResult =
  | { ok: true; tab: InjectableTab }
  | ({ ok: false } & CaptureFailure);

/** Never throws: every refusal comes back as a typed failure for the UI to word. */
export async function resolveInjectableTab(
  requirement?: PageRequirement,
): Promise<InjectableTabResult> {
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
  // the page has no business reading it — or writing to it.
  if (requirement && !requirement.accepts(url)) {
    return { ok: false, reason: 'wrong-page', url, expected: requirement.expected };
  }

  const block = findInjectionBlock(tab.url);
  if (block) return { ok: false, reason: 'restricted-page', block, url };

  // Chrome will happily inject into a loading page and hand back a half-built DOM, which
  // is silently wrong. Refusing is deterministic and the retry is one click.
  if (tab.status !== 'complete') return { ok: false, reason: 'still-loading', url };

  return { ok: true, tab: { id: tab.id, url, title: tab.title ?? url } };
}
