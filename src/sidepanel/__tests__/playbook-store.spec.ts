// @vitest-environment jsdom
// runPlaybook decodes its capture with DOMParser, which the side panel has and the
// default node environment does not.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

import type { PlaybookId } from '../../lib/playbooks/playbook';

const query = vi.fn();
const executeScript = vi.fn();
const storageGet = vi.fn(async () => ({}) as Record<string, unknown>);
const storageSet = vi.fn(async () => {});

vi.stubGlobal('chrome', {
  tabs: { query },
  scripting: { executeScript },
  storage: { local: { get: storageGet, set: storageSet } },
});

import {
  clearRun,
  hydratePlaybookSelection,
  runPlaybook,
  runState,
  selectPlaybook,
  selectedPlaybookId,
} from '../stores/playbook';

// A Toptal job page: the playbook refuses anything else before it reads a tab.
const JOB_URL = 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA/confirm';
const TAB = { id: 7, url: JOB_URL, title: 'Lead Engineer', status: 'complete' };

/** Carries one section hook, so a run comes back with something decoded to assert on. */
const JOB_HTML = '<div data-testid="jobHiringStatus">Matchers reviewing</div>';

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
  storageGet.mockReset();
  storageSet.mockReset();
  query.mockResolvedValue([TAB]);
  executeScript.mockResolvedValue([{ result: { html: JOB_HTML, totalChars: JOB_HTML.length } }]);
  storageGet.mockResolvedValue({});
  selectedPlaybookId.set('toptal');
  clearRun();
});

describe('runPlaybook', () => {
  it('starts idle', () => {
    expect(get(runState)).toEqual({ status: 'idle' });
  });

  it('goes idle → running → ready', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = runPlaybook();
    expect(get(runState).status).toBe('running');

    gate.resolve([{ result: { html: JOB_HTML, totalChars: JOB_HTML.length } }]);
    await run;

    // The section list itself belongs to toptal-job-sections.spec.ts; what this pins is
    // that the store carries it through beside the capture.
    const state = get(runState);
    expect(state).toMatchObject({ status: 'ready', capture: { html: JOB_HTML, url: JOB_URL } });
    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.sections[0]).toEqual({
      heading: 'Hiring Status',
      body: 'Matchers reviewing',
      found: true,
    });
  });

  it('ignores a second press while one run is in flight', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = runPlaybook();
    // Wait for the first press to actually reach the page. The capture awaits the tab lookup
    // before it injects, so asserting on a fixed number of microtasks pins how many `await`s
    // happen to precede the injection rather than the invariant this test is about.
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalled());

    await runPlaybook();

    expect(executeScript).toHaveBeenCalledTimes(1);
    gate.resolve([{ result: { html: JOB_HTML, totalChars: JOB_HTML.length } }]);
    await run;
  });

  // chrome://extensions is refused for two reasons at once. The playbook's own gate runs
  // first on purpose, because "open a Toptal job page" is the advice that actually works.
  it('keeps the failure reason intact rather than flattening it to a string', async () => {
    query.mockResolvedValue([{ ...TAB, url: 'chrome://extensions' }]);

    await runPlaybook();

    expect(get(runState)).toMatchObject({
      status: 'failed',
      failure: {
        ok: false,
        reason: 'wrong-page',
        url: 'chrome://extensions',
      },
    });
  });

  // The generation guard: a run superseded by clearRun must not write back.
  it('drops a reply from a superseded run', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = runPlaybook();
    clearRun();
    gate.resolve([{ result: { html: '<stale/>', totalChars: 8 } }]);
    await run;

    expect(get(runState)).toEqual({ status: 'idle' });
  });

  // Pins the "session only" decision: a page's full markup is the user's browsing
  // content and must never reach chrome.storage. The selected playbook id may; the
  // capture may not — so this asserts the payload, not the call count.
  it('never writes the capture to storage', async () => {
    await runPlaybook();

    for (const [items] of storageSet.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(JSON.stringify(items)).not.toContain('jobHiringStatus');
      expect(JSON.stringify(items)).not.toContain('Matchers reviewing');
    }
  });
});

describe('selectPlaybook', () => {
  // Toptal is the only playbook today, so switching *away* from something is the only
  // way to drive the change path. OTHER stands in for the second playbook; the cast is
  // what a single-member union costs, and it disappears the moment there are two.
  const OTHER = 'page-text' as PlaybookId;

  it('persists the choice under workflowsConfig, and writes no other key', async () => {
    selectedPlaybookId.set(OTHER);

    await selectPlaybook('toptal');

    expect(get(selectedPlaybookId)).toBe('toptal');
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith({ workflowsConfig: { playbook: 'toptal' } });
  });

  it('writes nothing when the playbook is already selected', async () => {
    await selectPlaybook('toptal');
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('clears a previous result so it cannot outlive its playbook', async () => {
    await runPlaybook();
    expect(get(runState).status).toBe('ready');

    selectedPlaybookId.set(OTHER);
    await selectPlaybook('toptal');

    expect(get(runState)).toEqual({ status: 'idle' });
  });

  // Bumping the generation is the point: without it a run started under the previous
  // playbook resolves later and lands under the new playbook's label.
  it('invalidates a run that is still in flight', async () => {
    const gate = deferred<unknown>();
    executeScript.mockReturnValue(gate.promise);

    const run = runPlaybook();
    selectedPlaybookId.set(OTHER);
    await selectPlaybook('toptal');
    gate.resolve([{ result: { html: '<stale/>', totalChars: 8 } }]);
    await run;

    expect(get(runState)).toEqual({ status: 'idle' });
  });
});

describe('hydratePlaybookSelection', () => {
  it('restores a stored choice', async () => {
    storageGet.mockResolvedValue({ workflowsConfig: { playbook: 'toptal' } });

    await hydratePlaybookSelection();

    expect(get(selectedPlaybookId)).toBe('toptal');
  });

  // A stored id can outlive the playbook that wrote it, and '' is what a profile that
  // never picked one returns. Neither may leave the tab without a playbook.
  it('falls back to the default for an unknown or unset id', async () => {
    storageGet.mockResolvedValue({ workflowsConfig: { playbook: 'obsidian-era' } });
    await hydratePlaybookSelection();
    expect(get(selectedPlaybookId)).toBe('toptal');

    storageGet.mockResolvedValue({});
    await hydratePlaybookSelection();
    expect(get(selectedPlaybookId)).toBe('toptal');
  });
});

describe('clearRun', () => {
  it('returns to idle', async () => {
    await runPlaybook();
    expect(get(runState).status).toBe('ready');

    clearRun();

    expect(get(runState)).toEqual({ status: 'idle' });
  });
});
