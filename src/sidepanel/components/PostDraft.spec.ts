import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PostDraft from './PostDraft.svelte';
import { AUDIT_ROWS, type AuditReport } from '$lib/linkedin/post-audit';
import { MIN_POST_CHARS } from '$lib/linkedin/post-audit-checks';
import { assemblePost } from '$lib/linkedin/post-draft';
import type { PostResult } from '$lib/linkedin/write-post';

const LONG = 'We cut the build from 9 minutes to 40 seconds with esbuild. '.repeat(24);
const CLOSE = 'What did you cut first, and what broke when you did?';
const TEXT = assemblePost('A line.\nA second.\nA third.', LONG, CLOSE);

function report(failing: string[] = []): AuditReport {
  const rows = AUDIT_ROWS.map((spec) => ({
    id: spec.id,
    pass: !failing.includes(spec.id),
    why: failing.includes(spec.id) ? 'a measured reason' : '',
  }));
  return { rows, passed: rows.every((r) => r.pass) };
}

function result(over: Partial<PostResult> = {}): PostResult {
  return {
    draft: { hook: 'A line.', body: LONG, close: CLOSE, closeKind: 'ctc', text: TEXT },
    report: report(),
    passes: 0,
    exhausted: false,
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PostDraft', () => {
  it('shows the post in an editable box', () => {
    render(PostDraft, { props: { result: result(), edited: TEXT, report: report() } });
    expect((screen.getByLabelText(/drafted post/i) as HTMLTextAreaElement).value).toBe(TEXT);
  });

  /**
   * Counts `edited`, never the model's original. The audit rules on what will be copied, and
   * a count that disagreed with it after one keystroke would be worse than no count.
   */
  it('counts the edited text, not the draft the model produced', () => {
    render(PostDraft, {
      props: { result: result(), edited: 'Short.', report: report(['length']) },
    });
    expect(screen.getByText(`6 / ${MIN_POST_CHARS.toLocaleString()}`)).toBeTruthy();
  });

  it('offers Copy post, and no button that writes into the page', () => {
    render(PostDraft, { props: { result: result(), edited: TEXT, report: report() } });
    expect(screen.getByRole('button', { name: 'Copy post' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /captur/i })).toBeNull();
  });

  it('copies the edited text rather than the original draft', async () => {
    render(PostDraft, { props: { result: result(), edited: 'my own words', report: report() } });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy post' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my own words');
  });

  it('renders the audit beneath the post', () => {
    render(PostDraft, {
      props: { result: result(), edited: TEXT, report: report(['voice-test']) },
    });
    expect(screen.getByText(/1 of 11 checks\s+needs your attention/)).toBeTruthy();
  });

  /** The remaining work is now the user's, so the run says so rather than looking finished. */
  it('says when the repair passes ran out', () => {
    render(PostDraft, {
      props: {
        result: result({ exhausted: true, passes: 2 }),
        edited: TEXT,
        report: report(['length']),
      },
    });
    expect(screen.getByText(/repair passes ran out/)).toBeTruthy();
  });

  it('stays quiet about repairs on a post that passed first time', () => {
    render(PostDraft, { props: { result: result(), edited: TEXT, report: report() } });
    expect(screen.queryByText(/repair passes ran out/)).toBeNull();
  });
});
