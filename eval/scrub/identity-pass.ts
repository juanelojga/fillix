import { redactPii } from './pii-patterns.ts';

/**
 * The per-fixture half of scrubbing: literal strings that identify one person.
 *
 * Separate from `pii-patterns.ts` because the two have different lifetimes. A pattern is a
 * property of the *shape* of secrets and ships in the repo; an identity is a property of whose
 * capture this is, lives in a gitignored file, and must never be committed — publishing the
 * list of strings that were removed would defeat removing them.
 *
 * Applied to Markdown and to serialized HTML alike. Nothing here knows about the DOM.
 */

export interface Identity {
  find: string;
  replace: string;
}

export interface ScrubReport {
  rule: string;
  hits: number;
}

/**
 * Longest `find` first, always.
 *
 * `juanelojga` is a substring of `juanelojga.com` and of the email, so replacing the bare
 * handle first would leave `alexrivera.com` and `alexrivera@gmail.com` behind — still the
 * original domains, and no later rule would match them. Sorting here rather than trusting the
 * file's order makes that impossible to get wrong by editing the JSON.
 */
export function applyIdentities(
  text: string,
  identities: Identity[],
): { text: string; report: ScrubReport[] } {
  const report: ScrubReport[] = [];
  let out = text;

  for (const { find, replace } of [...identities].sort((a, b) => b.find.length - a.find.length)) {
    const parts = out.split(find);
    if (parts.length > 1) report.push({ rule: find, hits: parts.length - 1 });
    out = parts.join(replace);
  }

  const redacted = redactPii(out);
  for (const { name, hits } of redacted.report) report.push({ rule: name, hits });

  return { text: redacted.text, report };
}
