import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CopyButton from './CopyButton.svelte';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('puts the text on the clipboard', async () => {
    render(CopyButton, { props: { text: 'the post' } });
    await fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('the post');
  });

  it('wears the label it was given', () => {
    render(CopyButton, { props: { text: 'x', label: 'Copy post' } });
    expect(screen.getByRole('button', { name: 'Copy post' })).toBeTruthy();
  });

  it('confirms the copy, then returns to its label', async () => {
    vi.useFakeTimers();
    render(CopyButton, { props: { text: 'x', label: 'Copy post' } });
    await fireEvent.click(screen.getByRole('button'));
    await vi.waitFor(() => expect(screen.getByRole('button').textContent).toContain('Copied'));
    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByRole('button').textContent).toContain('Copy post');
  });

  /**
   * The API is absent, not merely rejecting, in a panel served over a scheme Chrome declines —
   * so the guard is a branch, not a formality, and this must not throw.
   */
  it('words a missing clipboard API instead of throwing', async () => {
    vi.stubGlobal('navigator', {});
    render(CopyButton, { props: { text: 'x' } });
    await fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/Couldn't copy to the clipboard/)).toBeTruthy());
  });

  it('names the real cause when Chrome refuses the write', async () => {
    writeText.mockRejectedValue(new Error('Document is not focused'));
    render(CopyButton, { props: { text: 'x' } });
    await fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/not the focused surface/)).toBeTruthy());
    expect(screen.getByText(/Document is not focused/)).toBeTruthy();
  });

  /**
   * The component is rendered under two different labels. A hint naming a button that is not
   * on screen is the failure the diagnostics convention exists to prevent.
   */
  it('names the button by the label it is actually wearing', async () => {
    writeText.mockRejectedValue(new Error('nope'));
    render(CopyButton, {
      props: { text: 'x', label: 'Copy post', fallback: 'or select the text above by hand' },
    });
    await fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/press Copy post again/)).toBeTruthy());
    expect(screen.getByText(/select the text above by hand/)).toBeTruthy();
  });
});
