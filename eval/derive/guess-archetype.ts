import type { Archetype } from '../lib/golden.ts';

/**
 * A first guess at what a derived question is testing.
 *
 * Deliberately a guess, and it says so: `confidence` rides along and the derivation writes a
 * low-confidence guess into the case's `notes` so the reviewer's eye lands on it. The
 * alternative — leaving `archetype` unset — does not typecheck against the union, and
 * hand-typing thirty-six of these is exactly the tedium that produces a mislabelled set.
 *
 * Order is significant: the first match wins, and the specific phrasings are listed before the
 * generic ones. "Please share your availability over the next 5 business days" mentions neither
 * overlap nor an interview, so it has to be tested before the looser schedule rules.
 *
 * Nothing here decides a score. It decides where a human looks first.
 */
export interface ArchetypeGuess {
  archetype: Archetype;
  confidence: 'high' | 'low';
}

const RULES: { pattern: RegExp; archetype: Archetype; confidence: 'high' | 'low' }[] = [
  // The meta-question: naming a missing skill is the correct answer, so it must never be
  // confused with a skill question, which is exactly what a looser rule below would do.
  {
    pattern: /required skill.{0,40}missing|missing.{0,20}required skill/i,
    archetype: 'gap-disclosure',
    confidence: 'high',
  },
  {
    pattern: /from 1 to 5|rate yourself|scale of 1/i,
    archetype: 'self-rating',
    confidence: 'high',
  },

  {
    pattern: /next \d+ business days|availability over the next/i,
    archetype: 'schedule-enumerate',
    confidence: 'high',
  },
  {
    pattern:
      /available to interview|interview with you|soonest.{0,30}interview|schedule an interview|availability for an interview/i,
    archetype: 'schedule-slots',
    confidence: 'high',
  },
  { pattern: /overlap/i, archetype: 'schedule-recurring', confidence: 'high' },
  {
    pattern: /outside of toptal|working outside/i,
    archetype: 'external-commitments',
    confidence: 'high',
  },
  {
    pattern: /hours (a|per) week|guarantee.{0,30}availab|\d+\+? hours per week/i,
    archetype: 'hours-commitment',
    confidence: 'high',
  },
  { pattern: /time off|vacation|pto\b/i, archetype: 'logistics-timeoff', confidence: 'high' },
  {
    pattern: /how soon can you start|when can you start|start date/i,
    archetype: 'logistics-start',
    confidence: 'high',
  },
  {
    pattern: /prefer.{0,30}contact|slack or|by email/i,
    archetype: 'preference',
    confidence: 'high',
  },

  {
    pattern: /process for|your approach to|walk me through your/i,
    archetype: 'process-methodology',
    confidence: 'high',
  },
  {
    pattern: /walk me through a|describe a project|tell me about a (project|time)/i,
    archetype: 'anecdote-star',
    confidence: 'high',
  },
  {
    pattern: /are you comfortable|would you be (comfortable|willing)/i,
    archetype: 'comfort-willingness',
    confidence: 'high',
  },
  { pattern: /\by\s*\/\s*n\b|yes\s*\/\s*no/i, archetype: 'yes-no-explain', confidence: 'high' },
  {
    pattern: /speaker|do you speak|spanish|portuguese|language/i,
    archetype: 'factual-one-liner',
    confidence: 'high',
  },
  { pattern: /where are you based|based now/i, archetype: 'factual-one-liner', confidence: 'high' },

  // Everything below is a genuine coin-toss between supported/absent/partial, which is decided
  // by the profile and not by the wording. Flagged low so a human settles it.
  {
    pattern: /have you (built|shipped|worked)|any experience (in|with) the/i,
    archetype: 'domain-context',
    confidence: 'low',
  },
  {
    pattern: /experience (with|using|integrating)|level of experience|skills you have/i,
    archetype: 'supported-skill',
    confidence: 'low',
  },
];

export function guessArchetype(question: string, kind: 'question' | 'pitch'): ArchetypeGuess {
  if (kind === 'pitch') return { archetype: 'pitch', confidence: 'high' };

  for (const { pattern, archetype, confidence } of RULES) {
    if (pattern.test(question)) return { archetype, confidence };
  }
  return { archetype: 'vague-stack', confidence: 'low' };
}
