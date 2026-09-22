import { FUNNEL_STAGES, ICPS, PILLARS, STYLES, type PillarId } from './post-taxonomy';

/**
 * The prompts that decide the angle, and the JSON envelope `normalizeAngleBrief` parses.
 *
 * TypeScript rather than `src/prompts/*.md`, by the same rule as `topics-prompt.ts`: this
 * defines an envelope a parser depends on. The voice spec — the prose describing what each
 * pillar, style, stage and ICP actually means — arrives as a parameter.
 */

export const MAX_HOOK_CHARS = 210;
export const HOOK_LINES = 3;
export const MIN_HOOKS = 3;

export function briefSystemPrompt(voiceSpec: string): string {
  return [
    'You plan one LinkedIn post for one specific person. Everything you need to know about them is below.',
    '',
    "=== The author's positioning, voice, pillars and rules ===",
    voiceSpec,
    '=== end ===',
    '',
    'Decide the angle. You are not writing the post yet.',
    `"icp" — who this one post is for. Exactly one of: ${ICPS.join(' | ')}`,
    `"funnel" — exactly one of: ${FUNNEL_STAGES.join(' | ')}`,
    `"style" — exactly one of: ${STYLES.join(' | ')}, and it must be one the voice spec allows for the funnel stage you chose.`,
    `"pillar" — exactly one of: ${PILLARS.join(' | ')}`,
    '"spike" — the one spiky point of view this post argues, in a single sentence the author could defend to a founder\'s face. Cite the research by number where it supports you, like [2].',
    `"hooks" — exactly ${MIN_HOOKS} different openings. Each is ${HOOK_LINES} lines: a scroll breaker, then the tension, then the payoff promise. Each hook is under ${MAX_HOOK_CHARS} characters in total.`,
    '"trigger" — the psychological trigger each hook uses, in two or three words.',
    "Never invent a client name, an employer, a date, a number or a tool. Every specific comes from the author's own words or from the numbered research.",
    'No emoji. No hashtags. Do not write the body of the post.',
    'Respond with JSON only: {"icp":"<id>","pillar":"<id>","style":"<id>","funnel":"<id>","spike":"...","hooks":[{"trigger":"...","lines":["...","...","..."]}]}',
    // Said twice and said last: later rules dominate earlier ones for small models, and the
    // four ids are the fields whose near-miss discards the whole brief.
    `Again: "icp", "pillar", "style" and "funnel" are ids copied character for character from the lists above — never a label, never a phrase. Every hook has exactly ${HOOK_LINES} lines.`,
  ].join('\n');
}

export interface BriefPromptInput {
  topic: string;
  angle: string;
  pillar: PillarId;
  research: string;
  specifics: string;
  /** ISO day. The model has no clock, and the research carries dates. */
  today: string;
}

/**
 * Research before specifics, and specifics **last**.
 *
 * Ollama truncates an overflowing context from the start, so whatever leads is what gets
 * silently dropped. Two things must survive here and the tie breaks on consequence: a spike
 * whose evidence was truncated is merely weak, while a hook that invents a client name is the
 * fabrication this whole design exists to stop — and the specifics block is the shorter of the
 * two, so putting it last is also the cheaper insurance.
 */
export function buildBriefPrompt(input: BriefPromptInput): string {
  return [
    'The topic:',
    `${input.topic}\n${input.angle}`,
    '',
    `Pillar for this post: ${input.pillar}`,
    '',
    `Today is ${input.today}.`,
    '',
    'What the web and Hacker News say about this right now — the only outside evidence you may lean on:',
    input.research || '(no research was collected — do not cite outside evidence at all)',
    '',
    "The author's own experience, in their own words — the only place a named client, project, tool or number may come from:",
    input.specifics ||
      '(no profile sections matched — do not name a client, a project or a number you were not given)',
  ].join('\n');
}
