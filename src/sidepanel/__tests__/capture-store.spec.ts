import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const query = vi.fn();
const executeScript = vi.fn();
const storageSet = vi.fn(async () => {});

vi.stubGlobal('chrome', {
  tabs: { query },
  scripting: { executeScript },
  storage: { local: { get: vi.fn(async () => ({})), set: storageSet } },
});

import { captureState, capturePage, clearCapture } from '../stores/capture';

const TAB = { id: 7, url: 'https://example.com/a', title: 'Example', status: 'complete' };

/** A promise the test resolves by hand, to observe the in-flight state. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  query.mockReset();
  executeScript.mockReset();
  storageSet.mockReset();
  query.mockResolvedValue([TAB]);
  executeScript.mockResolvedValue([{ result: { html: '<html></html>', totalChars: 13 } }]);
  clearCapture();
});

describe('capturePage', () => {
  it('starts idle', () => {
    expect(get(captureState)).toEqual({ status: 'idle' });
  });

  it('goes idle → capturing → ready', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = capturePage();
    expect(get(captureState).status).toBe('capturing');

    gate.resolve([{ result: { html: '<h1>hi</h1>', totalChars: 11 } }]);
    await run;

    expect(get(captureState)).toMatchObject({
      status: 'ready',
      capture: { html: '<h1>hi</h1>', url: 'https://example.com/a' },
    });
  });

  it('ignores a second press while one capture is in flight', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = capturePage();
    await capturePage();

    expect(executeScript).toHaveBeenCalledTimes(1);
    gate.resolve([{ result: { html: '<html></html>', totalChars: 13 } }]);
    await run;
  });

  it('keeps the failure reason intact rather than flattening it to a string', async () => {
    query.mockResolvedValue([{ ...TAB, url: 'chrome://extensions' }]);

    await capturePage();

    expect(get(captureState)).toEqual({
      status: 'failed',
      failure: {
        ok: false,
        reason: 'restricted-page',
        block: { kind: 'restricted-scheme', scheme: 'chrome:' },
        url: 'chrome://extensions',
      },
    });
  });

  // The generation guard: a run superseded by clearCapture must not write back.
  it('drops a reply from a superseded run', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = capturePage();
    clearCapture();
    gate.resolve([{ result: { html: '<stale/>', totalChars: 8 } }]);
    await run;

    expect(get(captureState)).toEqual({ status: 'idle' });
  });

  // Pins the "session only" decision: a page's full markup is the user's browsing
  // content and must never reach chrome.storage.
  it('never writes the capture to storage', async () => {
    await capturePage();
    expect(storageSet).not.toHaveBeenCalled();
  });
});

describe('clearCapture', () => {
  it('returns to idle', async () => {
    await capturePage();
    expect(get(captureState).status).toBe('ready');

    clearCapture();

    expect(get(captureState)).toEqual({ status: 'idle' });
  });
});
