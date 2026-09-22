import { MAX_READING_GRADE, readingGrade } from './reading-level';
import type { CloseKind } from './post-draft';

/**
 * The rows a regex and a character count can settle, as pure functions of the post.
 *
 * Split from `post-audit.ts` because the two change for different reasons: the registry there
 * changes when Juan re-reads the algorithm and rewords a row, and a checker here changes when
 * a model finds a new way past one.
 *
 * Every function takes only the assembled post and reads **no model output at all**. That is
 * what makes `mergeAuditReport`'s refusal to let a verdict overturn these rows sufficient
 * rather than merely tidy.
 */

export const MIN_POST_CHARS = 1_200;
export const MAX_LIST_ITEMS = 7;
export const MAX_EM_DASHES_PER_PARAGRAPH = 1;

/**
 * The hard subset of the voice spec's list. The `.md` ends its list with "and similar", which
 * is guidance for the model; these are the words a regex can own without false positives.
 */
const BANNED =
  /\b(?:delve|delving|ever-evolving|ever-changing|game-?chang(?:er|ing)|leverag(?:e|ing) synerg\w*|navigat(?:e|ing) the ever|in today'?s (?:world|fast-paced world|digital age|landscape))\b|\b(?:the|a|this|our|its)\s+landscape\b/i;

/**
 * Any scheme, and any bare host with a common TLD.
 *
 * Matching only `https://` is exactly the failure this row exists to catch — `example.com/x`
 * costs the same 20–30% of reach and is what a model writes when told not to use a link.
 */
const EXTERNAL_LINK =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|io|dev|org|net|ai|co|sh|app)\b(?:\/\S*)?/i;

const FIRST_COMMENT =
  /(?:link|url)[^.\n]{0,40}(?:first|top)\s+comment|(?:first|top)\s+comment[^.\n]{0,40}(?:link|url)/i;

/** Emoji, pictographs and dingbats — the ranges a leading decoration actually comes from. */
const LEADING_EMOJI = /^[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const GREETING = /^(?:hi|hey|hello|good (?:morning|afternoon|evening))\b/i;

const YES_NO_CLOSE = /\b(?:agree|thoughts|right|am i wrong|makes sense|sound familiar)\s*\?\s*$/i;
const YES_NO_SENTENCE =
  /^(?:do|does|did|is|are|was|were|would|should|could|can|will|have|has)\b[^?]*\?$/i;

const PLATITUDE = /\b(?:hope this helps|thanks for reading|just my two cents)\b/i;

export interface AuditResult {
  pass: boolean;
  /** What was measured, or why it failed. '' on a pass. */
  why: string;
}

const PASS: AuditResult = { pass: true, why: '' };

export function checkLength(text: string): AuditResult {
  return text.length >= MIN_POST_CHARS
    ? PASS
    : {
        pass: false,
        why: `the post is ${text.length} characters and must be at least ${MIN_POST_CHARS}`,
      };
}

export function checkNoExternalLinks(text: string): AuditResult {
  const hit = text.match(EXTERNAL_LINK);
  return hit ? { pass: false, why: `the post contains a link: "${hit[0]}"` } : PASS;
}

export function checkNoFirstCommentLink(text: string): AuditResult {
  return FIRST_COMMENT.test(text)
    ? { pass: false, why: 'the post points the reader at a link in the first comment' }
    : PASS;
}

export function checkNoBannedVocab(text: string): AuditResult {
  const hit = text.match(BANNED);
  return hit ? { pass: false, why: `the post uses "${hit[0].trim()}"` } : PASS;
}

export function checkCleanOpening(text: string): AuditResult {
  const first = text.trimStart();
  if (LEADING_EMOJI.test(first)) return { pass: false, why: 'the post opens with an emoji' };
  if (GREETING.test(first)) return { pass: false, why: 'the post opens with a greeting' };
  return PASS;
}

export function checkReadingLevel(text: string): AuditResult {
  const grade = readingGrade(text);
  return grade <= MAX_READING_GRADE
    ? PASS
    : { pass: false, why: `reading level is grade ${grade}, above ${MAX_READING_GRADE}` };
}

export function checkNoAntiPatterns(text: string): AuditResult {
  const items = text.split('\n').filter((line) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line)).length;
  if (items > MAX_LIST_ITEMS) {
    return { pass: false, why: `the list runs to ${items} items, over ${MAX_LIST_ITEMS}` };
  }

  // Per paragraph, not per post: one em dash is a voice; four across four paragraphs is fine
  // and four in one is the thing that reads as generated.
  for (const paragraph of text.split(/\n{2,}/)) {
    const dashes = (paragraph.match(/—/g) ?? []).length;
    if (dashes > MAX_EM_DASHES_PER_PARAGRAPH) {
      return { pass: false, why: `one paragraph uses ${dashes} em dashes` };
    }
  }

  if (PLATITUDE.test(text)) return { pass: false, why: 'the post ends on a platitude' };
  return PASS;
}

/**
 * The preconditions only. Whether the close is any good is the model's to judge — a
 * deterministic check passes a close that is technically open-ended and completely lifeless.
 */
export function checkClosePreconditions(close: string, kind: CloseKind): AuditResult {
  const trimmed = close.trim();
  if (!trimmed) return { pass: false, why: 'the post has no close' };

  if (kind === 'cta') {
    const lines = trimmed.split('\n').filter(Boolean).length;
    return lines <= 3
      ? PASS
      : { pass: false, why: `the call to action runs to ${lines} lines, over 3` };
  }

  if (YES_NO_CLOSE.test(trimmed)) {
    return { pass: false, why: 'the close ends on a yes/no question' };
  }

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const last = sentences[sentences.length - 1]?.trim() ?? '';
  return YES_NO_SENTENCE.test(last)
    ? { pass: false, why: 'the closing question can be answered yes or no' }
    : PASS;
}
