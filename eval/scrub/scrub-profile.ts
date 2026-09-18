import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyIdentities, type Identity } from './identity-pass.ts';
import { findPii } from './pii-patterns.ts';

/**
 * Scrub the frozen profile in place: `pnpm eval:scrub-profile`.
 *
 * Markdown only — no structural surgery, because every heading, employer and project in this
 * document is load-bearing evidence. `##` headings are what `drew_on` cites and what the
 * citation check verifies against, so rewording one silently breaks every graded answer that
 * draws on it. Only the applicant's name and contact details change.
 *
 * The city and time zone are deliberately **kept**: three of the captured questions ask where
 * the applicant is based and how much overlap they can offer, and a profile with no location
 * would make those unanswerable by construction — grading a gap the fixture invented rather
 * than one the model produced.
 */
const DIR = path.resolve('eval/profile');
const SOURCE = path.join(DIR, 'profile.md');

function loadIdentities(): Identity[] {
  const raw = readFileSync(path.join(path.resolve('eval/scrub'), 'identities.local.json'), 'utf8');
  return (JSON.parse(raw) as { identities: Identity[] }).identities;
}

const before = readFileSync(SOURCE, 'utf8');
const { text, report } = applyIdentities(before, loadIdentities());

for (const { rule, hits } of report) console.log(`  ${rule.padEnd(24)} ${hits}`);

const remaining = findPii(text);
if (remaining.length > 0) {
  console.error(`\nRefusing to write — generic PII still present: ${JSON.stringify(remaining)}`);
  process.exit(1);
}

writeFileSync(SOURCE, text, 'utf8');
console.log(`\nScrubbed ${SOURCE} (${before.length} → ${text.length} chars)`);
