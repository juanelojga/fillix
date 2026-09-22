import { describe, it, expect } from 'vitest';
import {
  MIN_POST_CHARS,
  checkCleanOpening,
  checkClosePreconditions,
  checkLength,
  checkNoAntiPatterns,
  checkNoBannedVocab,
  checkNoExternalLinks,
  checkNoFirstCommentLink,
  checkReadingLevel,
} from '../post-audit-checks';

describe('checkLength', () => {
  it('fails one character short, and says the real number', () => {
    const result = checkLength('x'.repeat(MIN_POST_CHARS - 1));
    expect(result.pass).toBe(false);
    expect(result.why).toContain(String(MIN_POST_CHARS - 1));
  });

  it('passes at exactly the minimum', () => {
    expect(checkLength('x'.repeat(MIN_POST_CHARS)).pass).toBe(true);
  });
});

describe('checkNoExternalLinks', () => {
  /**
   * Matching only `https://` is exactly the failure this row exists to catch: a bare host
   * costs the same 20–30% of reach, and is what a model writes when told not to use a link.
   */
  it('catches a bare host with no scheme', () => {
    expect(checkNoExternalLinks('See example.com/pricing for more.').pass).toBe(false);
    expect(checkNoExternalLinks('Try esbuild.dev today.').pass).toBe(false);
  });

  it('catches a full URL', () => {
    expect(checkNoExternalLinks('Read https://example.com/x').pass).toBe(false);
  });

  it('quotes what it found, so the fix is obvious', () => {
    expect(checkNoExternalLinks('Go to example.com now').why).toContain('example.com');
  });

  it('passes ordinary prose about software', () => {
    expect(checkNoExternalLinks('We moved from Node 18 to Node 22.').pass).toBe(true);
    expect(checkNoExternalLinks('It took 4.5 seconds, down from 9.').pass).toBe(true);
  });
});

describe('checkNoFirstCommentLink', () => {
  it('catches both orderings of the instruction', () => {
    expect(checkNoFirstCommentLink('Link in the first comment.').pass).toBe(false);
    expect(checkNoFirstCommentLink('First comment has the link.').pass).toBe(false);
  });

  it('passes a post that merely mentions comments', () => {
    expect(checkNoFirstCommentLink('The best comment I got was from a CTO.').pass).toBe(true);
  });
});

describe('checkNoBannedVocab', () => {
  /**
   * The list in the voice spec said "in today's world"; a model writes "in today's fast-paced
   * world". Catching only the first is how this row passes the post it exists to fail.
   */
  it('catches the variations, not just the exact phrase', () => {
    for (const phrase of [
      "In today's fast-paced world, teams ship.",
      'Let us delve into the numbers.',
      'The ever-evolving stack.',
      'This is a game-changer.',
      'Navigating the ever-changing demands.',
      'The landscape has shifted.',
    ]) {
      expect(checkNoBannedVocab(phrase).pass, phrase).toBe(false);
    }
  });

  it('does not fail an honest sentence that happens to contain a substring', () => {
    expect(checkNoBannedVocab('We changed the game engine to Godot.').pass).toBe(true);
    expect(checkNoBannedVocab('I landscaped the garden last weekend.').pass).toBe(true);
  });
});

describe('checkCleanOpening', () => {
  it('catches a leading emoji, including one in a surrogate pair', () => {
    expect(checkCleanOpening('🚀 We shipped.').pass).toBe(false);
    expect(checkCleanOpening('✅ Done.').pass).toBe(false);
  });

  it('catches a greeting', () => {
    expect(checkCleanOpening('Hey founders — a thought.').pass).toBe(false);
  });

  it('passes a hook that opens on a claim', () => {
    expect(checkCleanOpening('Most startup MVPs are over-engineered.').pass).toBe(true);
  });

  it('allows an emoji later in the post', () => {
    expect(checkCleanOpening('We shipped. 🚀').pass).toBe(true);
  });
});

describe('checkNoAntiPatterns', () => {
  it('catches a list over seven items', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `${i + 1}. Item`).join('\n');
    expect(checkNoAntiPatterns(eight).pass).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => `${i + 1}. Item`).join('\n');
    expect(checkNoAntiPatterns(seven).pass).toBe(true);
  });

  /** Per paragraph, not per post: four across four paragraphs is a voice, four in one is not. */
  it('counts em dashes per paragraph', () => {
    expect(checkNoAntiPatterns('One — two — three.').pass).toBe(false);
    expect(checkNoAntiPatterns('One — two.\n\nThree — four.').pass).toBe(true);
  });

  it('catches a closing platitude', () => {
    expect(checkNoAntiPatterns('Hope this helps.').pass).toBe(false);
    expect(checkNoAntiPatterns('Thanks for reading.').pass).toBe(false);
  });
});

describe('checkReadingLevel', () => {
  it('passes plain writing about software', () => {
    const plain =
      'We cut the build from nine minutes to forty seconds. We used esbuild. The team noticed in a day.';
    expect(checkReadingLevel(plain).pass).toBe(true);
  });

  it('fails a wall of subordinate clauses', () => {
    const dense =
      'Notwithstanding the considerable architectural complexity inherent in distributed transactional systems, the organisation determined that comprehensive infrastructural modernisation represented an unavoidable prerequisite.';
    expect(checkReadingLevel(dense).pass).toBe(false);
  });
});

describe('checkClosePreconditions', () => {
  it('fails an empty close', () => {
    expect(checkClosePreconditions('   ', 'ctc').pass).toBe(false);
  });

  /** The row exists because "Agree?" is what a model writes when told to invite a reply. */
  it('fails a yes/no close for a conversation stage', () => {
    for (const close of ['Agree?', 'Thoughts?', 'Does that match your experience?']) {
      expect(checkClosePreconditions(close, 'ctc').pass, close).toBe(false);
    }
  });

  it('passes an open question', () => {
    const open = 'What did you cut first, and what broke when you did?';
    expect(checkClosePreconditions(open, 'ctc').pass).toBe(true);
  });

  it('caps a call to action at three lines', () => {
    expect(checkClosePreconditions('One\nTwo\nThree', 'cta').pass).toBe(true);
    expect(checkClosePreconditions('One\nTwo\nThree\nFour', 'cta').pass).toBe(false);
  });

  /** A CTA is a next step, not a question — the yes/no rule must not reach it. */
  it('does not apply the yes/no rule to a call to action', () => {
    expect(checkClosePreconditions('Want help? DM me the word AUDIT.', 'cta').pass).toBe(true);
  });
});
