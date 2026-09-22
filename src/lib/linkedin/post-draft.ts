import type { FunnelStage } from './post-taxonomy';

/**
 * What a drafted post is, and the envelope both stage-3 prompts emit.
 *
 * The parser lives here rather than beside the call, unlike `answers/draft-answer.ts`.
 * `write-post.ts` is not one call but a loop, and the first draft and every repair emit the
 * same envelope — putting the parser inside the orchestrator would give that loop two reasons
 * to change: how many passes it runs, and what a post looks like.
 */

export type CloseKind = 'ctc' | 'cta';

export const POST_ENVELOPE = 'Respond with JSON only: {"hook":"...","body":"...","close":"..."}';

export interface PostDraft {
  hook: string;
  body: string;
  close: string;
  /**
   * Derived from the brief's funnel stage, never read off the wire. Deliberately absent from
   * the envelope: asking the model which kind of close it wrote invites a self-report we would
   * have to re-derive anyway, and a model that mislabels it would have us audit the wrong rule.
   */
  closeKind: CloseKind;
  /** hook + body + close. What the audit measures and what the user copies. */
  text: string;
}

/** TOFU and MOFU invite a conversation; BOFU asks for the next step. */
export function closeKindFor(funnel: FunnelStage): CloseKind {
  return funnel === 'bofu' ? 'cta' : 'ctc';
}

/**
 * One blank line between the three parts, and that is the separator the audit counts against.
 * Kept in one place so the character count the user sees, the count `length` rules on and the
 * text on the clipboard can never disagree.
 */
export function assemblePost(hook: string, body: string, close: string): string {
  return [hook, body, close]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The single place a post's shape is enforced.
 *
 * Throws only on a missing part. Everything else — length, links, vocabulary, the shape of the
 * close — is an audit row with a named repair, because the human is the last step here and a
 * discarded draft costs a whole generation to get back.
 */
export function normalizePostDraft(raw: Record<string, unknown>, closeKind: CloseKind): PostDraft {
  const read = (key: string): string =>
    typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';

  const hook = read('hook');
  const body = read('body');
  const close = read('close');

  // Matched by `post-diagnostics.ts` — the first line only, as ever.
  if (!hook || !body || !close) {
    throw new Error('The model returned a post with a missing hook, body or close');
  }

  return { hook, body, close, closeKind, text: assemblePost(hook, body, close) };
}
