import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const executeScript = vi.fn();

vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });

import { readDocumentHtml } from '../../capture/active-tab-html';
import { HTML_CAPTURE_LIMIT } from '../../capture/html-budget';
import { DEFAULT_PLAYBOOK_ID, PLAYBOOKS, resolvePlaybook } from '../registry';

beforeEach(() => {
  query.mockReset();
  executeScript.mockReset();
  query.mockResolvedValue([
    { id: 7, url: 'https://example.com/a', title: 'Example', status: 'complete' },
  ]);
  executeScript.mockResolvedValue([{ result: { html: '<html></html>', totalChars: 13 } }]);
});

describe('the playbook registry', () => {
  it('offers at least one playbook', () => {
    expect(PLAYBOOKS.length).toBeGreaterThan(0);
  });

  it('gives every playbook a unique id', () => {
    const ids = PLAYBOOKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
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
  // Delegation only — the capture itself has its own four specs under lib/capture.
  it('runs the active-tab HTML capture', async () => {
    const result = await resolvePlaybook('toptal').run();

    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    const [options] = executeScript.mock.calls[0] as [
      chrome.scripting.ScriptInjection<[number], { html: string; totalChars: number }>,
    ];
    expect(options).toMatchObject({ func: readDocumentHtml, args: [HTML_CAPTURE_LIMIT] });
    expect(result).toMatchObject({ ok: true, capture: { url: 'https://example.com/a' } });
  });
});
