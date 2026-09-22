import { describe, it, expect } from 'vitest';
import { describeCaptureRun } from '../capture-status';
import type { RunState } from '../../playbooks/run-state';

const capture = {
  html: '<html></html>',
  url: 'https://example.com',
  title: 'Example',
  capturedAt: Date.parse('2026-09-21T09:14:00Z'),
  truncated: false,
  chars: 13,
};

describe('describeCaptureRun', () => {
  /**
   * These four strings were lifted out of `WorkflowsTab.svelte` when a second playbook kind
   * arrived. They are pinned byte-for-byte because every hint in `capture-diagnostics.ts`
   * refers to the button this labels, and a reworded move would break that silently.
   */
  it('keeps the idle wording that the capture hints refer to', () => {
    const chrome = describeCaptureRun({ status: 'idle' });
    expect(chrome.label).toBe('Capture');
    expect(chrome.statusLine).toBe('Nothing captured yet — press Capture');
    expect(chrome.announcement).toBe('');
  });

  it('keeps the running wording and marks itself busy', () => {
    const chrome = describeCaptureRun({ status: 'running' });
    expect(chrome.label).toBe('Capturing…');
    expect(chrome.busy).toBe(true);
    expect(chrome.statusLine).toBe('Reading the active tab…');
    expect(chrome.announcement).toBe('Reading the active tab.');
  });

  it('formats the capture time as hour and minute', () => {
    const state: RunState = { status: 'ready', capture, sections: [], brief: null };
    const chrome = describeCaptureRun(state);
    expect(chrome.statusLine).toMatch(/^Captured \d{1,2}:\d{2}/);
    expect(chrome.announcement).toBe('Page captured.');
  });

  it('carries the capture diagnosis into the announcement', () => {
    const state: RunState = { status: 'failed', failure: { reason: 'no-active-tab' } };
    const chrome = describeCaptureRun(state);
    expect(chrome.statusLine).toBe("Couldn't capture the page");
    expect(chrome.announcement).toMatch(/^Capture failed\. .+/);
  });
});
