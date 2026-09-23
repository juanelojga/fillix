/**
 * The prompts that write the messages, and the JSON envelope `normalizeNoteVariants` parses.
 *
 * In TypeScript rather than `src/prompts/*.md`, by the rule CLAUDE.md states: a prompt that
 * defines the JSON envelope its parser depends on is mechanism, not preference. The standing
 * instructions — who she is, the nickname, the tone — are the `.md`, and arrive here as a
 * parameter. So does the language: Spanish is a rule of this module, not a line the
 * instructions can drop.
 */

export const NOTE_VARIANT_COUNT = 3;

/**
 * The first and the last line of the system prompt, bilingual on purpose. Later rules
 * dominate earlier ones for small models, and the first line is what survives if a context
 * is ever cut from the end — so the one rule that must never be lost is stated at both ends,
 * in the language it asks for and in the language the rest of the prompt is written in.
 */
export const SPANISH_RULE =
  'Escribe siempre en español. Every message must be written in Spanish, never in English.';

/**
 * What fills the seed slot when the user typed nothing — the `topics-prompt.ts` move: the
 * prompt's shape never changes, only what occupies the slot.
 */
const NO_SEED_BRIEF = [
  'No seed was given.',
  'A message for no occasion — she is on your mind.',
  `${NOTE_VARIANT_COUNT} different angles, all in Spanish.`,
].join(' ');

export function noteSystemPrompt(instructions: string): string {
  return [
    SPANISH_RULE,
    'You write romantic, poetic messages from the author to their girlfriend. Everything you need to know about her, and about how the author talks to her, is below.',
    '',
    '=== Standing instructions ===',
    instructions,
    '=== end ===',
    '',
    `Write exactly ${NOTE_VARIANT_COUNT} messages. Each is 2 or 3 short paragraphs, about 80 to 150 words: a long, heartfelt message she reads on her phone, not a formal letter.`,
    "Be romantic and poetic: imagery, metaphor and sensory detail, with each message building to a tender closing line. Keep it in the author's own voice and avoid greeting-card clichés.",
    'Plain text only: no subject line, no greeting-and-signature block, no markdown, no lists. Separate paragraphs with a blank line (\\n\\n inside the JSON string).',
    'No emoji unless the instructions above ask for them.',
    `${NOTE_VARIANT_COUNT} different angles on the seed, not ${NOTE_VARIANT_COUNT} rewordings of one message.`,
    'Imagery and metaphor are welcome; invented facts are not.',
    'Work in the details the seed gives. Invent no facts about her, no plans, no dates and no memories that are not in the seed or in the instructions.',
    'Respond with JSON only: {"messages":["...","...","..."]}',
    `Again: ${NOTE_VARIANT_COUNT} messages in one "messages" array and nothing else. ${SPANISH_RULE}`,
  ].join('\n');
}

export function buildNotePrompt(seed: string): string {
  const trimmed = seed.trim();
  return trimmed
    ? [
        'What to write about, and details to work in (the seed may be in any language; the messages are in Spanish):',
        trimmed,
      ].join('\n')
    : NO_SEED_BRIEF;
}
