/**
 * Toptal's attributes grid, as key/value pairs.
 *
 * Works on the already-decoded section text rather than the markup: the grid is a run of
 * `<label>`s that `readable-text.ts` flattens to one line per cell, which is exactly the shape
 * this needs — and keeping it out of the DOM keeps it out of jsdom too.
 *
 * Its own file because it changes when Toptal reshuffles that grid, which has nothing to do
 * with when they reshuffle the skills chips.
 */

/**
 * A label line is one that *ends* with a colon. That the check is on the end and not on
 * "contains a colon" is load-bearing: `Client's Hours:` is a label and `2:00 AM – 3:00 PM` is
 * a value, and both contain one.
 */
export function extractJobAttributes(body: string): Record<string, string> {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const attributes: Record<string, string> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.endsWith(':')) continue;

    const value = lines[i + 1];
    // A label with nothing after it is a cell Toptal rendered empty. Recording it as '' would
    // put a blank row on screen and an empty fact in the prompt; skipping says nothing, which
    // is what we know.
    if (!value || value.endsWith(':')) continue;

    attributes[line.slice(0, -1).trim()] = value;
    i += 1;
  }

  return attributes;
}
