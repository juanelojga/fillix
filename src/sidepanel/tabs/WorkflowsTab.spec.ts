import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WorkflowsTab from './WorkflowsTab.svelte';
import { runState, clearRun, selectedPlaybookId } from '../stores/playbook';
import { modelList, ollamaConfig, workflowModel } from '../stores/settings';
import { resolvePlaybook } from '$lib/playbooks/registry';
import type { PageCapture } from '$lib/capture/html-budget';
import type { CapturedSection } from '$lib/playbooks/playbook';

function capture(overrides: Partial<PageCapture> = {}): PageCapture {
  return {
    html: '<html><h1>Hello</h1></html>',
    totalChars: 27,
    url: 'https://talent.toptal.com/portal/job/VjEtSm9iLTUwNzc5MA/confirm',
    title: 'Full-Stack Lead Engineer',
    capturedAt: Date.parse('2026-09-16T09:00:00Z'),
    ...overrides,
  };
}

const SECTIONS: CapturedSection[] = [
  { heading: 'Hiring Status', body: 'Matchers reviewing applications', found: true },
];

function ready(sections: CapturedSection[] = SECTIONS) {
  return { status: 'ready', capture: capture(), sections } as const;
}

beforeEach(() => {
  selectedPlaybookId.set('toptal');
  clearRun();
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
  modelList.set(['llama3.2', 'phi4']);
  workflowModel.set('');
  vi.restoreAllMocks();
});

describe('WorkflowsTab', () => {
  // The verb is the selected playbook's own. For a capture playbook it stays "Capture",
  // which is what keeps every "press Capture again" hint in capture-diagnostics.ts true.
  it('offers a worded Capture button for a capture playbook', () => {
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

  // The job text is already on the page behind the panel; the wall of it pushed the answer
  // cards off screen.
  it('does not show the decoded sections', () => {
    runState.set(ready());
    render(WorkflowsTab);

    expect(screen.queryByText('Hiring Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Matchers reviewing applications')).not.toBeInTheDocument();
  });

  // A hook that has moved is the one thing about the sections still worth a line: it empties
  // the brief the drafting runs on, and nothing else on the tab would say so.
  it('names a section whose hook it could not find', () => {
    runState.set(ready([{ heading: 'Job Description', body: '', found: false }]));
    render(WorkflowsTab);

    const notice = screen.getByText(/Not found on this page/);
    expect(notice.textContent).toContain('Job Description');
  });

  // The playbook reads one site, so this is the refusal the user will actually hit.
  it('tells the user which page to open when the tab is not a Toptal job page', () => {
    runState.set({
      status: 'failed',
      failure: {
        ok: false,
        reason: 'wrong-page',
        url: 'https://example.com/a',
        expected: 'a Toptal job page — https://talent.toptal.com/portal/job/…',
      },
    });
    render(WorkflowsTab);

    expect(screen.getByText(/press Capture again/)).toHaveTextContent(
      'https://talent.toptal.com/portal/job/',
    );
    expect(screen.getByText('https://example.com/a')).toBeInTheDocument();
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
    runState.set(ready());

    const first = render(WorkflowsTab);
    expect(first.getByText('Full-Stack Lead Engineer')).toBeInTheDocument();
    first.unmount();

    const second = render(WorkflowsTab);
    expect(second.getByText('Full-Stack Lead Engineer')).toBeInTheDocument();
  });
});

describe('WorkflowsTab model picker', () => {
  it('exposes the workflow model in the header', () => {
    render(WorkflowsTab);
    expect(screen.getByRole('button', { name: /workflow model: llama3\.2/i })).toBeInTheDocument();
  });

  // Three buttons share this header now. Each query must still resolve to exactly one
  // element, or the Capture hints point at something ambiguous.
  it('does not collide with the Capture button or the playbook picker', () => {
    render(WorkflowsTab);

    expect(screen.getByRole('button', { name: /^Capture$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /playbook: toptal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /workflow model/i })).toBeInTheDocument();
  });

  // Deliberate: the model is read when a question starts drafting, so a change made
  // mid-capture should be free to apply to the next run.
  it('leaves the picker usable while a capture is running', async () => {
    runState.set({ status: 'running' });
    render(WorkflowsTab);

    const trigger = screen.getByRole('button', { name: /workflow model/i });
    expect(trigger).not.toBeDisabled();
    await fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  describe('with the LinkedIn composer selected', () => {
    beforeEach(() => {
      selectedPlaybookId.set('linkedin-post');
    });

    /**
     * The invariant the `kind` discriminant exists for. Every hint in
     * `capture-diagnostics.ts` tells the user to "press Capture again", and those stay true
     * only while exactly one button carries that name — so the composer must not put a
     * second one on screen.
     */
    it('shows no Capture button at all', () => {
      render(WorkflowsTab);
      expect(screen.queryByRole('button', { name: /captur/i })).toBeNull();
    });

    it('names its own verb on the run button', () => {
      render(WorkflowsTab);
      expect(screen.getByRole('button', { name: /^Suggest topics$/ })).toBeInTheDocument();
    });

    it('keeps both pickers, so the model is still switchable', () => {
      render(WorkflowsTab);
      expect(screen.getByRole('button', { name: /workflow model/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /playbook/i })).not.toBeDisabled();
    });

    /** A compose playbook has no page to read, so pressing its button must touch no tab. */
    it('reads no tab when its button is pressed', async () => {
      const tabs = vi.spyOn(chrome.tabs, 'query');
      const inject = vi.spyOn(chrome.scripting, 'executeScript');
      render(WorkflowsTab);

      await fireEvent.click(screen.getByRole('button', { name: /^Suggest topics$/ }));

      expect(tabs).not.toHaveBeenCalled();
      expect(inject).not.toHaveBeenCalled();
    });

    it('shows the composer empty state, not the capture one', () => {
      render(WorkflowsTab);
      expect(screen.getByText('No topics yet.')).toBeInTheDocument();
      expect(screen.queryByText('No page captured yet.')).toBeNull();
    });
  });

  describe('with the love note selected', () => {
    beforeEach(() => {
      selectedPlaybookId.set('love-note');
    });

    /** Neither of the other two describers' verbs may appear: each one's hints name only its own. */
    it('shows no Capture and no Suggest topics button', () => {
      render(WorkflowsTab);
      expect(screen.queryByRole('button', { name: /captur/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /suggest topics/i })).toBeNull();
    });

    it('names its own verb on the run button', () => {
      render(WorkflowsTab);
      expect(screen.getByRole('button', { name: /^Write messages$/ })).toBeInTheDocument();
    });

    it('keeps both pickers, so the model is still switchable', () => {
      render(WorkflowsTab);
      expect(screen.getByRole('button', { name: /workflow model/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /playbook/i })).not.toBeDisabled();
    });

    /** A note playbook has no page to read, so pressing its button must touch no tab. */
    it('reads no tab when its button is pressed', async () => {
      const tabs = vi.spyOn(chrome.tabs, 'query');
      const inject = vi.spyOn(chrome.scripting, 'executeScript');
      render(WorkflowsTab);

      await fireEvent.click(screen.getByRole('button', { name: /^Write messages$/ }));

      expect(tabs).not.toHaveBeenCalled();
      expect(inject).not.toHaveBeenCalled();
    });

    it('shows the love note empty state, and neither of the others', () => {
      render(WorkflowsTab);
      expect(screen.getByText('No messages yet.')).toBeInTheDocument();
      expect(screen.queryByText('No topics yet.')).toBeNull();
      expect(screen.queryByText('No page captured yet.')).toBeNull();
    });
  });
});
