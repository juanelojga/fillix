import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureActiveTabHtml, readDocumentHtml, type PageRequirement } from '../active-tab-html';
import { HTML_CAPTURE_LIMIT } from '../html-budget';

const query = vi.fn();
const executeScript = vi.fn();

vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });

function tab(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    url: 'https://example.com/a',
    title: 'Example',
    status: 'complete',
    ...overrides,
  };
}

/**
 * Deliberately not Toptal's: the mechanism must never learn which site a playbook wants.
 */
function requirement(accepts: (url: string) => boolean): PageRequirement {
  return { accepts, expected: 'a test page' };
}

beforeEach(() => {
  query.mockReset();
  executeScript.mockReset();
  query.mockResolvedValue([tab()]);
  executeScript.mockResolvedValue([{ result: { html: '<html></html>', totalChars: 13 } }]);
});

describe('captureActiveTabHtml', () => {
  it('returns the page HTML with the tab identity', async () => {
    const result = await captureActiveTabHtml();

    expect(result).toMatchObject({
      ok: true,
      capture: {
        html: '<html></html>',
        totalChars: 13,
        url: 'https://example.com/a',
        title: 'Example',
      },
    });
  });

  it('asks only for the active tab of this window', async () => {
    await captureActiveTabHtml();
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('injects into the top frame only, with the cap passed as an argument', async () => {
    await captureActiveTabHtml();

    const [options] = executeScript.mock.calls[0];
    expect(options.target).toEqual({ tabId: 7 });
    expect(options.allFrames).toBeUndefined();
    expect(options.args).toEqual([HTML_CAPTURE_LIMIT]);
    expect(options.func).toBe(readDocumentHtml);
  });

  it('reports no active tab when the query comes back empty', async () => {
    query.mockResolvedValue([]);
    expect(await captureActiveTabHtml()).toEqual({ ok: false, reason: 'no-active-tab' });
  });

  it('reports no active tab when Chrome gives a tab with no id', async () => {
    query.mockResolvedValue([tab({ id: undefined })]);
    expect(await captureActiveTabHtml()).toEqual({ ok: false, reason: 'no-active-tab' });
  });

  // The whole point of the pre-flight: Chrome's own refusal is brittle to match on and
  // unfit to show a user, so we must never reach executeScript for a blocked page.
  it('never calls executeScript for a restricted page', async () => {
    query.mockResolvedValue([tab({ url: 'chrome://extensions' })]);

    const result = await captureActiveTabHtml();

    expect(executeScript).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: 'restricted-page',
      block: { kind: 'restricted-scheme', scheme: 'chrome:' },
      url: 'chrome://extensions',
    });
  });

  // Injecting into a loading page returns a half-built DOM, which is silently wrong.
  it('never calls executeScript while the tab is still loading', async () => {
    query.mockResolvedValue([tab({ status: 'loading' })]);

    const result = await captureActiveTabHtml();

    expect(executeScript).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'still-loading', url: 'https://example.com/a' });
  });

  it('catches an injection rejection instead of throwing, keeping the message', async () => {
    executeScript.mockRejectedValue(new Error('Cannot access contents of the url'));

    expect(await captureActiveTabHtml()).toEqual({
      ok: false,
      reason: 'injection-failed',
      error: 'Cannot access contents of the url',
      url: 'https://example.com/a',
    });
  });

  // A tab that navigated or crashed mid-injection resolves empty rather than rejecting.
  it('reports an empty result when no frame answered', async () => {
    executeScript.mockResolvedValue([]);
    expect(await captureActiveTabHtml()).toMatchObject({ ok: false, reason: 'empty-result' });
  });

  it('reports an empty result when the frame answered with nothing', async () => {
    executeScript.mockResolvedValue([{ result: undefined }]);
    expect(await captureActiveTabHtml()).toMatchObject({ ok: false, reason: 'empty-result' });
  });

  it('captures as before when the playbook demands no particular page', async () => {
    const result = await captureActiveTabHtml();

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true });
  });

  it('captures when the requirement accepts the page', async () => {
    const result = await captureActiveTabHtml(requirement(() => true));

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true });
  });

  // Same reasoning as the restricted-page pre-flight: a playbook that cannot use the page
  // has no business reading it.
  it('never calls executeScript for a page the requirement rejects', async () => {
    const result = await captureActiveTabHtml(requirement(() => false));

    expect(executeScript).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: 'wrong-page',
      url: 'https://example.com/a',
      expected: 'a test page',
    });
  });

  // '' is what the predicate gets for a tab Chrome reports no URL for, so it must cope.
  it('offers the requirement an empty string when the tab has no URL', async () => {
    query.mockResolvedValue([tab({ url: undefined })]);
    const accepts = vi.fn().mockReturnValue(false);

    await captureActiveTabHtml(requirement(accepts));

    expect(accepts).toHaveBeenCalledWith('');
  });

  // Ahead of the broader refusals on purpose: "open the page this playbook reads" is
  // complete advice, while "Chrome blocks chrome: pages" is true and still not enough.
  it('prefers the wrong-page refusal over the restricted-page one', async () => {
    query.mockResolvedValue([tab({ url: 'chrome://extensions' })]);

    const result = await captureActiveTabHtml(requirement(() => false));

    expect(result).toMatchObject({ ok: false, reason: 'wrong-page' });
  });

  it('prefers the wrong-page refusal over the still-loading one', async () => {
    query.mockResolvedValue([tab({ status: 'loading' })]);

    const result = await captureActiveTabHtml(requirement(() => false));

    expect(result).toMatchObject({ ok: false, reason: 'wrong-page' });
  });

  it('falls back to the URL when the tab has no title', async () => {
    query.mockResolvedValue([tab({ title: undefined })]);
    const result = await captureActiveTabHtml();
    expect(result).toMatchObject({ ok: true, capture: { title: 'https://example.com/a' } });
  });
});

describe('readDocumentHtml', () => {
  // Runs in the page world, so it is tested directly against a stubbed document rather
  // than through executeScript.
  it('slices to the limit but reports the real length', () => {
    vi.stubGlobal('document', { documentElement: { outerHTML: 'abcdefghij' } });

    expect(readDocumentHtml(4)).toEqual({ html: 'abcd', totalChars: 10 });
  });

  it('returns the whole document when it fits', () => {
    vi.stubGlobal('document', { documentElement: { outerHTML: 'abc' } });

    expect(readDocumentHtml(100)).toEqual({ html: 'abc', totalChars: 3 });
  });
});
