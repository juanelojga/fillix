import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WorkflowsTab from './WorkflowsTab.svelte';
import { runState, clearRun, selectedPlaybookId } from '../stores/playbook';
import { resolvePlaybook } from '$lib/playbooks/registry';
import type { PageCapture } from '$lib/capture/html-budget';

function capture(overrides: Partial<PageCapture> = {}): PageCapture {
  return {
    html: '<html><h1>Hello</h1></html>',
    totalChars: 27,
    url: 'https://example.com/a',
    title: 'Example Domain',
    capturedAt: Date.parse('2026-09-16T09:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  selectedPlaybookId.set('toptal');
  clearRun();
  vi.restoreAllMocks();
});

describe('WorkflowsTab', () => {
  // The verb stays "Capture" whichever playbook is selected: every hint in
  // capture-diagnostics.ts tells the user to "press Capture again".
  it('offers a worded Capture button', () => {
    render(WorkflowsTab);
    expect(screen.getByRole('button', { name: /^Capture$/ })).toBeInTheDocument();
  });

  // Pins the on-demand requirement: the tab must not read the user's page just because
  // they looked at it.
  it('reads no tab on mount', () => {
    const tabs = vi.spyOn(chrome.tabs, 'query');
    const inject = vi.spyOn(chrome.scripting, 'executeScript');

    render(WorkflowsTab);

    expect(tabs).not.toHaveBeenCalled();
    expect(inject).not.toHaveBeenCalled();
  });

  it('names the selected playbook in the header', () => {
    render(WorkflowsTab);
    expect(screen.getByRole('button', { name: /playbook: toptal/i })).toBeInTheDocument();
  });

  // The empty state is the playbook's own description, not the tab's: the tab has no
  // idea what any given playbook reads.
  it('explains what the selected playbook will do before anything is captured', () => {
    render(WorkflowsTab);

    expect(screen.getByText('Nothing captured yet — press Capture')).toBeInTheDocument();
    expect(screen.getByText('No page captured yet.')).toBeInTheDocument();
    expect(screen.getByText(resolvePlaybook('toptal').description)).toBeInTheDocument();
  });

  it('reads the active tab when Capture is pressed', async () => {
    const tabs = vi.spyOn(chrome.tabs, 'query');
    render(WorkflowsTab);

    await fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));

    expect(tabs).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('disables and rewords the button while capturing', () => {
    runState.set({ status: 'running' });
    render(WorkflowsTab);

    const button = screen.getByRole('button', { name: /Capturing/ });
    expect(button).toBeDisabled();
    // Exact: the sr-only region carries the same words with a full stop.
    expect(screen.getByText('Reading the active tab…')).toBeInTheDocument();
  });

  it('renders the captured markup as text', () => {
    runState.set({ status: 'ready', capture: capture() });
    const { container } = render(WorkflowsTab);

    expect(container.querySelector('pre')?.textContent).toContain('<h1>Hello</h1>');
    expect(container.querySelector('pre h1')).toBeNull();
  });

  // A worded badge alone is not enough — the hint says what to do and the detail says
  // which page Chrome refused.
  it('shows the summary, the next step and the raw detail on failure', () => {
    runState.set({
      status: 'failed',
      failure: {
        ok: false,
        reason: 'restricted-page',
        block: { kind: 'restricted-scheme', scheme: 'chrome:' },
        url: 'chrome://extensions',
      },
    });
    render(WorkflowsTab);

    expect(screen.getByText('Chrome blocks chrome: pages')).toBeInTheDocument();
    expect(screen.getByText(/Switch to an http:\/\/ or https:\/\/ tab/)).toBeInTheDocument();
    expect(screen.getByText('chrome://extensions')).toBeInTheDocument();
  });

  it('keeps one persistent live region so state changes are announced', () => {
    runState.set({ status: 'running' });
    render(WorkflowsTab);

    expect(screen.getByRole('status')).toHaveTextContent('Reading the active tab.');
  });

  /**
   * The reason the capture lives in a store rather than a rune: bits-ui unmounts
   * TabsContent for the inactive tab, so glancing at Chat and back destroys and
   * recreates this component.
   */
  it('survives an unmount and remount with the capture intact', () => {
    runState.set({ status: 'ready', capture: capture() });

    const first = render(WorkflowsTab);
    expect(first.container.querySelector('pre')?.textContent).toContain('Hello');
    first.unmount();

    const second = render(WorkflowsTab);
    expect(second.container.querySelector('pre')?.textContent).toContain('Hello');
  });
});
