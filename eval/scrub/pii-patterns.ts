/**
 * The patterns a scrubbed capture must not contain, independent of whose capture it is.
 *
 * Identity strings — a name, an employer, a job id — are per-fixture and arrive separately.
 * These are the shapes that are personal or secret whatever they spell, and they exist so
 * `golden.eval.ts` can assert a committed file is clean without being told what to look for.
 * A rule that only ever ran at authoring time would prove nothing about the file in git.
 */

export interface PiiPattern {
  /** Named so a failure says which rule fired, not just that one did. */
  name: string;
  pattern: RegExp;
  /** What a hit becomes. A stable placeholder, never a random value: fixtures must be diffable. */
  replace: string;
}

export const PII_PATTERNS: PiiPattern[] = [
  { name: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replace: 'person@example.com' },
  {
    // Deliberately conservative: a run of 7+ digits with separators, not every number on a page.
    // Toptal renders hour counts and connection counts as bare integers and those must survive.
    name: 'phone',
    pattern: /\+?\d[\d\s().-]{8,}\d/g,
    replace: '+10000000000',
  },
  {
    name: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9_-]*/g,
    replace: 'TOKEN',
  },
  {
    name: 'uuid',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replace: '00000000-0000-0000-0000-000000000000',
  },
  {
    // uploads.toptal.io/.../user/<id>/<hash>.jpg — the id identifies the applicant.
    name: 'toptal-upload',
    pattern: /https:\/\/uploads\.toptal\.io\/[^"'\s)]+/g,
    replace: 'https://example.invalid/avatar.jpg',
  },
  {
    name: 'toptal-profile-path',
    pattern: /\/profile\/[A-Za-z0-9_-]{6,}/g,
    replace: '/profile/REDACTED',
  },
];

/**
 * Text a scrub has already produced, which must not be flagged as a finding.
 *
 * RFC 2606 and RFC 6761 reserve `example.com`, `.example` and `.invalid` for exactly this, so a
 * placeholder written into a fixture is recognisable as one rather than merely hoped to be.
 * Without this the scrubber refuses its own output: `alex.rivera@example.com` is email-shaped,
 * so a fixed-point check on raw shape alone can never pass.
 *
 * An ISO date is here for the same reason and is worth naming: `2026-09-17` is ten characters
 * of digits and hyphens, which is precisely the `phone` shape. Every golden case carries a
 * frozen `now` and every job a `capturedAt`, so without this rule the golden set reports one
 * phone number per date and the real finding — if there ever is one — is lost in the count.
 */
const RESERVED =
  /@example\.(?:com|org|net)$|\.example\b|\.invalid\b|^\+10000000000$|^0{8}-|^\d{4}-\d{2}-\d{2}$/;

function matchesOf(text: string, pattern: RegExp): string[] {
  const found = text.match(new RegExp(pattern.source, pattern.flags)) ?? [];
  return found.filter((m) => !RESERVED.test(m));
}

/**
 * What still looks personal after scrubbing. Empty is the only acceptable result for a
 * committed fixture, and `golden.eval.ts` asserts it on every run — not just at authoring
 * time, when the file that gets committed is not yet the file that was checked.
 */
export function findPii(text: string): { name: string; hits: number }[] {
  return PII_PATTERNS.map(({ name, pattern }) => ({
    name,
    hits: matchesOf(text, pattern).length,
  })).filter((r) => r.hits > 0);
}

/** Redacts every non-placeholder match, leaving anything already scrubbed untouched. */
export function redactPii(text: string): {
  text: string;
  report: { name: string; hits: number }[];
} {
  const report: { name: string; hits: number }[] = [];
  let out = text;

  for (const { name, pattern, replace } of PII_PATTERNS) {
    let hits = 0;
    out = out.replace(new RegExp(pattern.source, pattern.flags), (m) => {
      if (RESERVED.test(m)) return m;
      hits += 1;
      return replace;
    });
    if (hits > 0) report.push({ name, hits });
  }

  return { text: out, report };
}
