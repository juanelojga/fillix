import { describe, it, expect } from 'vitest';
import { findInjectionBlock } from '../injectable-url';

describe('findInjectionBlock', () => {
  it('allows ordinary http and https pages', () => {
    expect(findInjectionBlock('https://example.com/a?b=1')).toBeNull();
    expect(findInjectionBlock('http://localhost:3000/')).toBeNull();
  });

  it.each([
    ['chrome://settings', 'chrome:'],
    ['chrome-untrusted://print', 'chrome-untrusted:'],
    ['chrome-extension://abcdef/panel.html', 'chrome-extension:'],
    ['devtools://devtools/bundled/x.html', 'devtools:'],
    ['about:blank', 'about:'],
    ['view-source:https://example.com', 'view-source:'],
  ])('refuses %s and names the scheme', (url, scheme) => {
    expect(findInjectionBlock(url)).toEqual({ kind: 'restricted-scheme', scheme });
  });

  it("refuses Fillix's own pages — an extension cannot read another extension", () => {
    expect(findInjectionBlock('chrome-extension://self/src/sidepanel/index.html')).toEqual({
      kind: 'restricted-scheme',
      scheme: 'chrome-extension:',
    });
  });

  it('refuses both Web Store hosts', () => {
    expect(findInjectionBlock('https://chromewebstore.google.com/detail/x')).toEqual({
      kind: 'web-store',
    });
    expect(findInjectionBlock('https://chrome.google.com/webstore/category/extensions')).toEqual({
      kind: 'web-store',
    });
  });

  // The host alone is an ordinary Google page — only the /webstore path is blocked.
  it('allows chrome.google.com outside /webstore', () => {
    expect(findInjectionBlock('https://chrome.google.com/')).toBeNull();
  });

  it('gives file URLs their own reason — <all_urls> does not cover them', () => {
    expect(findInjectionBlock('file:///tmp/page.html')).toEqual({ kind: 'file-url' });
  });

  it('refuses rather than guesses when the tab reports no URL', () => {
    expect(findInjectionBlock(undefined)).toEqual({ kind: 'unknown-url' });
    expect(findInjectionBlock('')).toEqual({ kind: 'unknown-url' });
  });

  it('refuses an unparseable URL', () => {
    expect(findInjectionBlock('not a url')).toEqual({ kind: 'unknown-url' });
  });
});
