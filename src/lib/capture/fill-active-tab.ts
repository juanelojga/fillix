import type { FieldLocator } from './field-locator';
import { resolveInjectableTab, type CaptureFailure, type PageRequirement } from './injectable-tab';

/**
 * Writes approved text into the active tab's form controls.
 *
 * Runs from the **side panel**, like the capture and for the same reason: the rule that the
 * worker owns outbound requests is about network *origin*, and `chrome.scripting` has none.
 * `chrome.tabs.query({ active: true, currentWindow: true })` is also exact here and a guess
 * from a worker, which has no current window.
 *
 * It never presses Submit, and it cannot: the only elements it will write to are text inputs
 * and textareas, and a submit button is neither.
 */

export interface FillRequest {
  locator: FieldLocator;
  value: string;
}

export type FillOutcome =
  | { locator: FieldLocator; ok: true }
  | { locator: FieldLocator; ok: false; reason: 'not-found' | 'not-fillable' };

export type FillResult = { ok: true; outcomes: FillOutcome[] } | ({ ok: false } & CaptureFailure);

/**
 * Runs in the page. Closes over nothing — `chrome.scripting` stringifies it, so an import or a
 * module-scope constant resolves to undefined in the page world. Everything arrives in `args`.
 *
 * `anchorSelector` is how an ordinal locator stays meaningful: the parser counted fields inside
 * the application form, so this has to count inside the same one. It is given the same anchor
 * the parser used and climbs to the same enclosing form, rather than being told about any
 * particular site.
 */
export function writeFields(requests: FillRequest[], anchorSelector: string): FillOutcome[] {
  const anchor = anchorSelector ? document.querySelector(anchorSelector) : null;
  const root: ParentNode = anchor?.closest('form') ?? anchor ?? document;

  const FILLABLE_INPUT_TYPES = ['text', 'email', 'tel', 'url', 'search', 'number'];

  /**
   * An autosizing textarea ships a measuring twin behind `aria-hidden` + `readonly`, carrying
   * the same name and the same classes. Writing to it is invisible to the user and to the form,
   * and it is what a plain `querySelector` picks roughly half the time.
   */
  const usable = (el: Element): HTMLInputElement | HTMLTextAreaElement | null => {
    if (el.getAttribute('aria-hidden') === 'true') return null;
    if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el;
    if (el instanceof HTMLInputElement) {
      if (el.readOnly || el.disabled) return null;
      return FILLABLE_INPUT_TYPES.includes(el.type) ? el : null;
    }
    return null;
  };

  const firstUsable = (
    candidates: ArrayLike<Element>,
  ): HTMLInputElement | HTMLTextAreaElement | null => {
    for (let i = 0; i < candidates.length; i += 1) {
      const found = usable(candidates[i]);
      if (found) return found;
    }
    return null;
  };

  const find = (locator: FieldLocator): Element | null | 'unusable' => {
    if (locator.by === 'name') {
      const matches = document.getElementsByName(locator.value);
      if (matches.length === 0) return null;
      return firstUsable(matches) ?? 'unusable';
    }
    if (locator.by === 'id') {
      const el = document.getElementById(locator.value);
      if (!el) return null;
      return usable(el) ?? 'unusable';
    }
    const fields = Array.from(root.querySelectorAll('input, textarea')).filter(
      (el) => usable(el) !== null,
    );
    return fields[locator.index] ?? null;
  };

  const outcomes: FillOutcome[] = [];

  for (const request of requests) {
    const found = find(request.locator);
    if (found === null) {
      outcomes.push({ locator: request.locator, ok: false, reason: 'not-found' });
      continue;
    }
    if (found === 'unusable') {
      outcomes.push({ locator: request.locator, ok: false, reason: 'not-fillable' });
      continue;
    }
    const el = usable(found);
    if (!el) {
      outcomes.push({ locator: request.locator, ok: false, reason: 'not-fillable' });
      continue;
    }

    el.focus();

    /**
     * Through the prototype's setter, never `el.value = text`.
     *
     * React installs a `_valueTracker` on every controlled input. A direct assignment updates
     * that tracker as a side effect, so when the `input` event arrives React compares the new
     * value against the tracker, sees no change, and drops the event — the box shows the text
     * and the component's state never hears about it, so the form submits empty. Going through
     * the prototype setter bypasses the tracker, which then reports a change and React updates.
     */
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, request.value);
    else el.value = request.value;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();

    outcomes.push({ locator: request.locator, ok: true });
  }

  return outcomes;
}

export async function fillActiveTab(
  requirement: PageRequirement,
  requests: FillRequest[],
  /** The anchor an ordinal locator counts within — the playbook's, never this module's. */
  anchorSelector: string,
): Promise<FillResult> {
  if (requests.length === 0) return { ok: true, outcomes: [] };

  // The same pre-flight as the capture, in the same order and from the same module. Writing
  // to a page we are not allowed to read would be the worse mistake of the two.
  const resolved = await resolveInjectableTab(requirement);
  if (!resolved.ok) return resolved;
  const { id, url } = resolved.tab;

  let frames: chrome.scripting.InjectionResult<FillOutcome[]>[];
  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: writeFields,
      args: [requests, anchorSelector],
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'injection-failed', error, url };
  }

  const outcomes = frames?.[0]?.result;
  if (!outcomes) return { ok: false, reason: 'empty-result', url };

  return { ok: true, outcomes };
}
