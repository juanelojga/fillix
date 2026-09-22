import { PILLARS } from './post-taxonomy';

/**
 * The prompts that suggest post topics, and the JSON envelope `normalizeTopicSuggestions`
 * parses.
 *
 * In TypeScript rather than `src/prompts/*.md`, by the rule CLAUDE.md states: a prompt that
 * defines the JSON envelope its parser depends on is mechanism, not preference. The voice
 * spec — who the author is, what the pillars mean, how they write — is the `.md`, and it
 * arrives here as a parameter.
 */

export const TOPIC_COUNT = 5;

const PILLAR_LIST = PILLARS.join(' | ');

/**
 * What fills the seed slot when the user typed nothing.
 *
 * The `PITCH_BRIEF` move: the prompt's shape never changes, only what occupies the slot. An
 * empty seed is a supported input, not a missing one, and leaving the slot blank would let a
 * small model decide the sentence before it was the instruction.
 */
const NO_SEED_BRIEF = [
  'No seed was given.',
  'Choose freely across AI, software development, software architecture, machine learning and models.',
  'Five different subjects, not five angles on one.',
].join(' ');

export function topicsSystemPrompt(voiceSpec: string): string {
  return [
    'You suggest LinkedIn post topics for one specific person. Everything you need to know about them is below.',
    '',
    "=== The author's positioning, voice and content pillars ===",
    voiceSpec,
    '=== end ===',
    '',
    `Suggest exactly ${TOPIC_COUNT} post topics across AI, software development, software architecture, machine learning and models.`,
    'Each topic is one line of subject ("title") and one line of the angle to take on it ("angle").',
    'No hooks, no drafts, no hashtags, no emoji. Do not write the post.',
    'Every topic must be one this author could write from real experience. Never propose a topic that needs a client, a company, a benchmark or a number they do not have.',
    'Five different subjects. Two angles on the same subject count as one topic, not two.',
    `"pillar" is EXACTLY one of these ids, copied character for character: ${PILLAR_LIST}`,
    'Respond with JSON only: {"topics":[{"title":"...","angle":"...","pillar":"<id>"}]}',
    // Said twice and said last, the `pitchSystemPrompt` pattern: later rules dominate earlier
    // ones for small models, and the id is the one field whose near-miss loses the whole item.
    `Again: "pillar" is one of ${PILLAR_LIST} and nothing else. The id exactly as written above, never a label and never a phrase.`,
  ].join('\n');
}

export function buildTopicsPrompt(seed: string): string {
  const trimmed = seed.trim();
  return trimmed ? ['What the author wants to write about:', trimmed].join('\n') : NO_SEED_BRIEF;
}
