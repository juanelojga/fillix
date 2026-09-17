/**
 * Which pages Chrome refuses to inject into.
 *
 * No permission can lift these — they are browser policy, not a manifest gap. Checking
 * up front is what lets the UI name the cause: Chrome's own refusal arrives as
 * `Cannot access contents of the url "chrome://extensions/"`, which is both brittle to
 * match on and useless to a user.
 */

export type InjectionBlock =
  | { kind: 'restricted-scheme'; scheme: string }
  | { kind: 'web-store' }
  | { kind: 'file-url' }
  | { kind: 'unknown-url' };

/** Schemes an extension is never allowed to read, whatever host_permissions say. */
const BLOCKED_SCHEMES = [
  'chrome:',
  'chrome-untrusted:',
  'chrome-extension:',
  'chrome-search:',
  'devtools:',
  'about:',
  'view-source:',
  'edge:',
];

/**
 * The Web Store is blocked by host, not by scheme — and only under these paths.
 * `chrome.google.com` on its own is an ordinary page.
 */
function isWebStore(url: URL): boolean {
  if (url.hostname === 'chromewebstore.google.com') return true;
  return url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore');
}

/** `null` means injectable. Anything unparseable is refused rather than attempted. */
export function findInjectionBlock(url: string | undefined): InjectionBlock | null {
  if (!url) return { kind: 'unknown-url' };

  // Matched before parsing: `view-source:https://x` parses with protocol 'view-source:'
  // in some engines and throws in others.
  const scheme = BLOCKED_SCHEMES.find((s) => url.toLowerCase().startsWith(s));
  if (scheme) return { kind: 'restricted-scheme', scheme };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'unknown-url' };
  }

  // Possible, but only once the user ticks "Allow access to file URLs" — <all_urls>
  // does not cover it, so it gets its own worded hint rather than a generic refusal.
  if (parsed.protocol === 'file:') return { kind: 'file-url' };
  if (isWebStore(parsed)) return { kind: 'web-store' };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'restricted-scheme', scheme: parsed.protocol };
  }

  return null;
}
