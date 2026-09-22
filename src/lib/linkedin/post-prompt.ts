import { POST_ENVELOPE, type CloseKind } from './post-draft';
import type { AngleBrief, HookVariant } from './write-brief';

/**
 * The prompts that write the post. TypeScript, by the envelope rule.
 *
 * `SHARED_RULES` from `answers/answer-prompt.ts` is deliberately **not** imported. That
 * constant says "use ONLY the profile excerpts", which would forbid the research this post is
 * built on. Its own header already argues that voice and the shape of an unsupported answer
 * are per-prompt; this is that argument one step further — the grounding rule differs too,
 * because a post has two admissible sources and an application answer has one.
 */

/**
 * Only the close rule that applies, never both behind an "if". A small model handed a
 * conditional writes both branches.
 */
const CLOSE_RULE: Record<CloseKind, string> = {
  ctc: 'Close with a Call to Conversation: one specific, open-ended question that invites a paragraph in reply. Never a yes/no question, and never "Agree?" or "Thoughts?".',
  cta: 'Close with a Call to Action: one direct next step, at most three lines, tonally separate from the body. No external link — point at the bio or the Featured section.',
};

export function postSystemPrompt(voiceSpec: string, closeKind: CloseKind): string {
  return [
    'You write one LinkedIn post, in the first person, as the author. Everything you need to know about them is below.',
    '',
    "=== The author's positioning, voice, pillars and rules ===",
    voiceSpec,
    '=== end ===',
    '',
    'The hook is given to you. Write the body and the close beneath it, and return the hook unchanged.',
    'Never invent a client name, an employer, a date, a tool you were not shown, or a number. Every specific comes from the author’s own words above or from the numbered research.',
    'Every claim carries a number, a named tool, or a named moment. A sentence that asserts something with none of those does not belong in the post.',
    'Do not cite sources by number in the post itself. The numbers are for you; the reader sees prose.',
    'No external links anywhere, and never tell the reader to look in the first comment.',
    'No hashtags. No emoji at the start of any line.',
    'Line breaks generously — one idea per line in the story parts.',
    CLOSE_RULE[closeKind],
    POST_ENVELOPE,
    // Said last, the `pitchSystemPrompt` pattern: later rules dominate earlier ones, and the
    // voice is the thing a small model drifts away from first.
    'Again: first person, short sentences, 7th–8th grade reading level. If a line would feel weird said aloud to a founder over coffee, it does not go in.',
  ].join('\n');
}

export interface PostPromptInput {
  brief: AngleBrief;
  hook: HookVariant;
  research: string;
  specifics: string;
}

/**
 * Research before specifics, specifics last — `brief-prompt.ts`'s ordering and its reasoning,
 * because Ollama truncates an overflowing context from the start and the author's own words
 * are the one thing that must survive.
 */
export function buildPostPrompt(input: PostPromptInput): string {
  return [
    'The angle this post argues:',
    input.brief.spike,
    '',
    `Pillar: ${input.brief.pillar} · Style: ${input.brief.style} · Stage: ${input.brief.funnel} · Written for: ${input.brief.icp}`,
    '',
    'These are the first three lines. Return them unchanged as "hook":',
    input.hook.lines.join('\n'),
    '',
    'What the web and Hacker News say about this right now:',
    input.research || '(no research was collected — do not cite outside evidence at all)',
    '',
    "The author's own experience, in their own words — the only place a named client, project, tool or number may come from:",
    input.specifics ||
      '(no profile sections matched — do not name a client, a project or a number you were not given)',
  ].join('\n');
}
