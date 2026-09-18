/**
 * Which numbers in an answer are not supported by the evidence that produced it.
 *
 * This is the check that catches "opens with a negation, then invents an employer and a date",
 * the failure `states-no-experience.ts` documents — and it applies to cited answers too, since
 * a correctly cited paragraph does not license a tenure nobody wrote down.
 *
 * Its own module because the comparison is **semantic, not literal**, and a literal one looked
 * right until it was run: the profile says `9+ years` and six pitches said `over 9 years of
 * experience`, which is the same true claim with the `+` moved into a word. All six were
 * reported as fabrications. A grader that flags an accurate statement teaches its reader to
 * ignore it, which is worse than not having the check.
 */

/** A four-digit year is exact; there is no looser reading of `2019`. */
const YEAR = /\b(?:19|20)\d{2}\b/g;
const TENURE = /\b(\d+)\s*\+?\s*(years?|yrs?|months?|mos?)\b/gi;

/** `yrs` and `years` are the same claim, and so are `mo` and `months`. */
function unitPattern(unit: string): string {
  return /^(?:y|yr)/i.test(unit) ? '(?:years?|yrs?)' : '(?:months?|mos?)';
}

export function unsupportedNumbers(text: string, evidence: string): string[] {
  const out: string[] = [];

  for (const year of text.match(YEAR) ?? []) {
    if (!evidence.includes(year)) out.push(year);
  }

  for (const match of text.matchAll(TENURE)) {
    const [whole, count, unit] = match;
    if (!count || !unit) continue;
    // `9 years` is supported by `9+ years`, `9 yrs` and `over 9 years` alike — the claim is the
    // number and the unit, not the punctuation around them.
    const supported = new RegExp(`\\b${count}\\s*\\+?\\s*${unitPattern(unit)}\\b`, 'i');
    if (!supported.test(evidence)) out.push(whole.trim());
  }

  return out;
}

/** How many numeric claims were checked at all — a case with none scores `null`, not a pass. */
export function countNumericClaims(text: string): number {
  return (text.match(YEAR) ?? []).length + [...text.matchAll(TENURE)].length;
}
