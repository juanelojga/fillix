import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AuditChecklist from './AuditChecklist.svelte';
import { AUDIT_ROWS, type AuditReport } from '$lib/linkedin/post-audit';

function report(over: Partial<Record<string, { pass: boolean; why: string }>> = {}): AuditReport {
  const rows = AUDIT_ROWS.map((spec) => ({
    id: spec.id,
    pass: over[spec.id]?.pass ?? true,
    why: over[spec.id]?.why ?? '',
  }));
  return { rows, passed: rows.every((r) => r.pass) };
}

describe('AuditChecklist', () => {
  it('says so plainly when everything passes', () => {
    render(AuditChecklist, { props: { report: report(), passes: 0 } });
    expect(screen.getByText(/All 11 checks pass/)).toBeTruthy();
  });

  /**
   * The voice spec says to fix silently and re-run. Here the user approves before anything is
   * copied, and a hidden failure is the one thing a reviewer cannot catch.
   */
  it('shows a still-failing row with its measured reason', () => {
    render(AuditChecklist, {
      props: {
        report: report({ length: { pass: false, why: 'the post is 1043 characters' } }),
        passes: 2,
      },
    });
    expect(screen.getByText('At least 1,200 characters')).toBeTruthy();
    expect(screen.getByText(/1043 characters/)).toBeTruthy();
  });

  it('agrees its verb with the count, not with the word "checks"', () => {
    render(AuditChecklist, {
      props: { report: report({ length: { pass: false, why: 'short' } }), passes: 0 },
    });
    expect(screen.getByText(/1 of 11 checks\s+needs your attention/)).toBeTruthy();
  });

  it('counts the failures rather than leaving the user to', () => {
    render(AuditChecklist, {
      props: {
        report: report({
          length: { pass: false, why: 'short' },
          'voice-test': { pass: false, why: 'line 4' },
        }),
        passes: 1,
      },
    });
    expect(screen.getByText(/2 of 11 checks\s+need your attention/)).toBeTruthy();
  });

  it('says how many repairs it took, so a hard-won draft reads as one', () => {
    render(AuditChecklist, { props: { report: report(), passes: 2 } });
    expect(screen.getByText('Repaired 2 times')).toBeTruthy();
  });

  it('lists no rows at all when nothing failed', () => {
    render(AuditChecklist, { props: { report: report(), passes: 0 } });
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
