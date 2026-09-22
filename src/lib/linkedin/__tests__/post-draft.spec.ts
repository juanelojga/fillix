import { describe, it, expect } from 'vitest';
import { assemblePost, closeKindFor, normalizePostDraft } from '../post-draft';

describe('closeKindFor', () => {
  /** The close kind is derived, never asked of the model — a mislabel audits the wrong rule. */
  it('asks BOFU for an action and everything else for a conversation', () => {
    expect(closeKindFor('bofu')).toBe('cta');
    expect(closeKindFor('tofu')).toBe('ctc');
    expect(closeKindFor('mofu')).toBe('ctc');
  });
});

describe('assemblePost', () => {
  it('joins the three parts with one blank line', () => {
    expect(assemblePost('Hook', 'Body', 'Close')).toBe('Hook\n\nBody\n\nClose');
  });

  it('trims each part, so stray whitespace cannot move the character count', () => {
    expect(assemblePost('  Hook  ', '\nBody\n', 'Close ')).toBe('Hook\n\nBody\n\nClose');
  });

  it('drops an empty part rather than leaving a double gap', () => {
    expect(assemblePost('Hook', '', 'Close')).toBe('Hook\n\nClose');
  });
});

describe('normalizePostDraft', () => {
  const GOOD = { hook: 'A hook', body: 'A body', close: 'A close' };

  it('assembles the text the audit will measure', () => {
    const draft = normalizePostDraft(GOOD, 'ctc');
    expect(draft.text).toBe('A hook\n\nA body\n\nA close');
    expect(draft.closeKind).toBe('ctc');
  });

  it('carries the close kind it was given, never one off the wire', () => {
    const draft = normalizePostDraft({ ...GOOD, closeKind: 'cta' }, 'ctc');
    expect(draft.closeKind).toBe('ctc');
  });

  it('throws on a missing part, which is the only thing there is no repair for', () => {
    expect(() => normalizePostDraft({ ...GOOD, body: '' }, 'ctc')).toThrow(
      /missing hook, body or close/i,
    );
    expect(() => normalizePostDraft({ ...GOOD, close: '   ' }, 'ctc')).toThrow();
    expect(() => normalizePostDraft({}, 'ctc')).toThrow();
  });

  /** Length, links and vocabulary are audit rows with named repairs, not reasons to discard. */
  it('accepts a short post — that is an audit row, not a parse failure', () => {
    expect(normalizePostDraft({ hook: 'A', body: 'B', close: 'C' }, 'ctc').text).toBe(
      'A\n\nB\n\nC',
    );
  });

  it('ignores a non-string field rather than coercing it', () => {
    expect(() => normalizePostDraft({ ...GOOD, hook: 42 }, 'ctc')).toThrow();
  });
});
