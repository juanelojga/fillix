/**
 * Whether an uncited answer is a bare statement of having no experience.
 *
 * The gate in front of the grounding guard in `draft-answer.ts`, and deliberately a strict
 * one. It is the mirror image of `mentions-time.ts`, whose header explains why *that* gate is
 * loose — there a false positive costs one small generation. Here the errors are the ones
 * `draft-answer.ts` already names: failing costs one re-draft, while letting text through
 * costs a claim of experience the applicant does not have, in front of a recruiter. When in
 * doubt this returns false.
 *
 * It only ever sees the uncited case: when the model cited a heading the guard passes the
 * answer without asking. And an answer that cites nothing has nothing to point at, so it must
 * be a *bare* denial — the "nearest real experience" clause the prompt allows requires
 * evidence, and evidence means a citation. So the checks are structural rather than about
 * tone, none of them fakeable by writing well:
 *
 *   1. Short enough to be one sentence. Fabrication needs room.
 *   2. The negation is in the *first* sentence, not buried under a paragraph of claims.
 *   3. No year and no tenure. An uncited sentence must not carry a date or a duration.
 *
 * Check 3 is what catches the answer this gate exists for — the mixed one, which opens with a
 * negation and then invents an employer and a date:
 *
 *   "I don't have direct experience with the Square API, but I built payment integrations
 *    with Stripe and handled ESC/POS printers at Acme in 2019."
 */

/** A bare denial is one sentence. Generous enough for a long technology name, and no more. */
const MAX_DENIAL_CHARS = 240;

/**
 * The first-person negations a model actually writes when told to say it lacks something.
 * Both apostrophes, straight and typographic, because a model emits either.
 */
const NEGATION =
  /\bi(?:\s+do\s+not|\s+don[’']t|\s+have\s+not|\s+haven[’']t|\s+have\s+never|\s+had\s+never|[’']ve\s+not|[’']ve\s+never|\s+am\s+not|\s+was\s+not|\s+cannot|\s+can[’']t)\b|\bno\s+(?:direct\s+)?(?:experience|background|exposure)\b|\bnever\s+(?:worked|used)\b|\bnot\s+something\s+i\b|\bnothing\s+in\s+my\b/i;

/** A year. An uncited sentence has no evidence for one, so it must not state one. */
const YEAR = /\b(?:19|20)\d{2}\b/;

/** A tenure — "6 years", "18 months", "10+ yrs". Same reasoning as the year. */
const TENURE = /\b\d+\s*\+?\s*(?:years?|yrs?|months?|mos?)\b/i;

/**
 * Up to the first sentence end. `Node.js` cuts this short, which is harmless: a denial leads
 * with its negation, so a shorter window can only ever be stricter.
 */
function firstSentence(text: string): string {
  return /^[^.!?]*/.exec(text)?.[0] ?? text;
}

export function statesNoExperience(text: string): boolean {
  const trimmed = text.trim();
  // '' is a blank answer, not a denial. Reading it as one would let the card tell the user the
  // model said something it did not say.
  if (!trimmed || trimmed.length > MAX_DENIAL_CHARS) return false;
  if (YEAR.test(trimmed) || TENURE.test(trimmed)) return false;
  return NEGATION.test(firstSentence(trimmed));
}
