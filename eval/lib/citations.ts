import { AVAILABILITY_HEADING } from '../../src/lib/profile/availability-text';

/**
 * What a model's `drew_on` entry actually points at.
 *
 * Its own module because it has changed three times for reasons that have nothing to do with
 * the checks that consume it — hard-wrapped source, an unsearched availability block, elided
 * quotes — while the check list stayed still. That is the definition of a separate reason to
 * change.
 */
const baseHeading = (h: string) => h.replace(/ \(\d+\/\d+\)$/, '').trim();

/** A citation as the model wrote it, reduced to the heading it was meant to be: a `## ` prefix
 * and trailing punctuation are formatting, not meaning. */
const normalizeCitation = (raw: string) =>
  baseHeading(raw.replace(/^#+\s*/, '').replace(/[.:;,\s]+$/, ''));

export type Citation =
  /** Names a section that was actually retrieved. */
  | { kind: 'heading'; heading: string; raw: string }
  /** Not a heading, but verbatim in a retrieved section — the right source, cited badly. */
  | { kind: 'quoted'; heading: string; raw: string }
  /** Traceable to nothing the model was shown. */
  | { kind: 'invented'; heading: null; raw: string };

/**
 * Resolve what each `drew_on` entry actually refers to.
 *
 * The distinction is the whole value of this check. `answer-prompt.ts` asks for "the exact `##`
 * headings", and a model that instead quotes the paragraph it used has not hallucinated
 * anything — it has formatted a true citation badly, which is a prompt problem. A model that
 * names a section it was never shown has invented its evidence, which is the failure the whole
 * grounding design exists to stop. Scoring both as one number hides the second behind the
 * first, and they do not have the same fix.
 *
 * Three details are load-bearing, and the first run got all three wrong before they were:
 *
 * - **Whitespace is flattened on both sides.** `profile.md` is hard-wrapped, so a chunk holds
 *   `"…Asterisk ARI and\nWebSockets"` where the model quotes it re-flowed with a space. A raw
 *   `includes` misses every multi-line quote and reports it as invented.
 * - **The availability block is searched too.** It is real evidence that never came from a
 *   retrieved chunk, so a schedule answer quoting its own computed overlap would otherwise be
 *   scored as fabricating it — the exact inversion of what this check is for.
 * - **Short quotes count.** `"Aug 2026 – present"` is eighteen characters and unambiguous; a
 *   length floor tuned to exclude coincidence was excluding evidence.
 */
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Long enough that a coincidental substring match is not plausible, short enough to keep a
 * date range or a job title. */
const MIN_QUOTE_CHARS = 12;

/** How much of a quote's opening must match when the whole of it does not. */
const QUOTE_PREFIX_CHARS = 40;

export function resolveCitations(
  drewOn: string[],
  chunks: { heading: string; text: string }[],
  availabilityBlock: string,
): Citation[] {
  const headings = new Set(chunks.map((k) => baseHeading(k.heading)));
  const hasAvailability = availabilityBlock.trim() !== '';
  if (hasAvailability) headings.add(AVAILABILITY_HEADING);

  const flatChunks = chunks.map((k) => ({ heading: baseHeading(k.heading), text: flat(k.text) }));
  const flatAvailability = flat(availabilityBlock);

  return drewOn.map((raw): Citation => {
    const normalized = normalizeCitation(raw);
    if (headings.has(normalized)) return { kind: 'heading', heading: normalized, raw };

    const needle = flat(normalized);
    if (needle.length >= MIN_QUOTE_CHARS) {
      // Whole quote first, then its opening. A model that quotes evidence rarely reproduces it
      // exactly: it elides the middle with "…", joins a heading to its body with " - ", or
      // stops mid-sentence. Those are all still citations of text it was shown, and the prefix
      // is long enough that matching one by accident is not a real risk.
      const opening = needle.slice(0, QUOTE_PREFIX_CHARS);
      const owner = flatChunks.find((k) => k.text.includes(needle) || k.text.includes(opening));
      if (owner) return { kind: 'quoted', heading: owner.heading, raw };
      if (
        hasAvailability &&
        (flatAvailability.includes(needle) || flatAvailability.includes(opening))
      ) {
        return { kind: 'quoted', heading: AVAILABILITY_HEADING, raw };
      }
    }

    // Everything else is untraceable, and two kinds land here on purpose. A citation too short
    // to identify anything (`"gaps"`, `"..."`, a bare project name) is not a citation. And text
    // lifted from the **job posting** is not profile evidence — `drew_on` is specified as the
    // profile's own `##` headings, so quoting the client's description back is exactly the
    // confusion this check should surface rather than forgive.
    return { kind: 'invented', heading: null, raw };
  });
}
