// @vitest-environment jsdom
// The Toptal run decodes its capture with DOMParser, which the side panel has and the
// default node environment does not.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const executeScript = vi.fn();

vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });

import { readDocumentHtml } from '../../capture/active-tab-html';
import { HTML_CAPTURE_LIMIT } from '../../capture/html-budget';
import { DEFAULT_PLAYBOOK_ID, PLAYBOOKS, resolvePlaybook } from '../registry';

const JOB_URL = 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA/confirm';
const JOB_HTML =
  '<html><body><div data-testid="jobHiringStatus">Matchers reviewing</div></body></html>';

beforeEach(() => {
  query.mockReset();
  executeScript.mockReset();
  query.mockResolvedValue([{ id: 7, url: JOB_URL, title: 'Lead Engineer', status: 'complete' }]);
  executeScript.mockResolvedValue([{ result: { html: JOB_HTML, totalChars: JOB_HTML.length } }]);
});

describe('the playbook registry', () => {
  it('offers at least one playbook', () => {
    expect(PLAYBOOKS.length).toBeGreaterThan(0);
  });

  it('gives every playbook a unique id', () => {
    const ids = PLAYBOOKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The kind discriminant is what keeps a compose playbook out of `runState`, and with it
   * out of `diagnoseCaptureFailure` — whose every hint says "press Capture again" and is
   * true only while a button by that name is on screen.
   */
  it('gives every playbook a kind, and `run` only to the captures', () => {
    for (const playbook of PLAYBOOKS) {
      expect(['capture', 'compose']).toContain(playbook.kind);
      if (playbook.kind === 'capture') {
        expect(typeof playbook.run).toBe('function');
      } else {
        expect('run' in playbook).toBe(false);
      }
    }
  });

  it('offers both a capture playbook and a compose one', () => {
    expect(PLAYBOOKS.some((p) => p.kind === 'capture')).toBe(true);
    expect(PLAYBOOKS.some((p) => p.kind === 'compose')).toBe(true);
  });

  it('resolves the LinkedIn composer by its stored id', () => {
    expect(resolvePlaybook('linkedin-post').kind).toBe('compose');
  });

  // Both strings reach the screen verbatim — the label is the picker row and the
  // description is the whole empty state, so neither may be blank.
  it('gives every playbook a label and a description', () => {
    for (const playbook of PLAYBOOKS) {
      expect(playbook.label.trim()).not.toBe('');
      expect(playbook.description.trim()).not.toBe('');
    }
  });

  it('lists the default id', () => {
    expect(PLAYBOOKS.some((p) => p.id === DEFAULT_PLAYBOOK_ID)).toBe(true);
  });
});

describe('resolvePlaybook', () => {
  it('resolves a known id', () => {
    expect(resolvePlaybook('toptal').id).toBe('toptal');
  });

  // '' is what storage returns before the user has ever picked one.
  it('falls back to the default for an unset preference', () => {
    expect(resolvePlaybook('')).toBe(resolvePlaybook(DEFAULT_PLAYBOOK_ID));
  });

  // A stored id can outlive the playbook that wrote it. A stranded tab is worse than
  // silently landing on the default.
  it('falls back to the default for a playbook that no longer exists', () => {
    expect(resolvePlaybook('obsidian-era')).toBe(resolvePlaybook(DEFAULT_PLAYBOOK_ID));
  });
});

describe('the Toptal playbook', () => {
  // Delegation only — the capture itself has its own specs under lib/capture, and the
  // section map and URL gate have their own beside this one.
  it('runs the active-tab HTML capture', async () => {
    const result = await resolvePlaybook('toptal').run();

    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    const [options] = executeScript.mock.calls[0] as [
      chrome.scripting.ScriptInjection<[number], { html: string; totalChars: number }>,
    ];
    expect(options).toMatchObject({ func: readDocumentHtml, args: [HTML_CAPTURE_LIMIT] });
    expect(result).toMatchObject({ ok: true, capture: { url: JOB_URL } });
  });

  it('decodes the captured markup into the job page sections', async () => {
    const result = await resolvePlaybook('toptal').run();

    if (!result.ok) throw new Error(`expected a capture, got ${result.reason}`);
    expect(result.sections.map((s) => s.heading)).toContain('Hiring Status');
    expect(result.sections[0]).toMatchObject({ found: true, body: 'Matchers reviewing' });
  });

  // The playbook reads one site. Anywhere else it must refuse rather than hand back a
  // page of empty sections — and must not read the tab to find that out.
  it('refuses a tab that is not a Toptal job page, without injecting', async () => {
    query.mockResolvedValue([
      { id: 7, url: 'https://example.com/a', title: 'Example', status: 'complete' },
    ]);

    const result = await resolvePlaybook('toptal').run();

    expect(executeScript).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, reason: 'wrong-page' });
  });
});
