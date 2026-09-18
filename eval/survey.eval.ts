import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { extractJobSections } from '../src/lib/playbooks/toptal-job-sections';
import { buildJobBrief } from '../src/lib/playbooks/toptal-job-brief';
import { extractApplicationFields } from '../src/lib/playbooks/toptal-application-form';
import { missingRequiredSkills } from '../src/lib/playbooks/job-brief';

/**
 * Not a test — a survey. Prints what each raw capture in `cases/incoming/` actually parses to,
 * so the fixture set can be judged for archetype coverage before anything is scrubbed or
 * hand-labelled. Deleted once `fixtures.eval.ts` takes over.
 */
const DIR = path.resolve('eval/cases/incoming');

describe('capture survey', () => {
  it('parses every incoming capture', () => {
    for (const file of readdirSync(DIR)
      .filter((f) => f.endsWith('.html'))
      .sort()) {
      const html = readFileSync(path.join(DIR, file), 'utf8');
      const sections = extractJobSections(html);
      const brief = buildJobBrief(sections, html);
      const fields = extractApplicationFields(html);

      const missing = missingRequiredSkills(brief);
      const req = brief.skills.required;
      const claimed = req.filter((s) => s.onProfile).length;

      console.log(`\n═══ ${file}  (${html.length.toLocaleString()} chars)`);
      console.log(
        `  sections found : ${
          sections
            .filter((s) => s.found)
            .map((s) => s.heading)
            .join(' | ') || '(none)'
        }`,
      );
      const absent = sections.filter((s) => !s.found).map((s) => s.heading);
      if (absent.length) console.log(`  sections MISSING: ${absent.join(' | ')}`);
      console.log(`  description    : ${brief.description.length} chars`);
      console.log(
        `  attributes     : ${
          Object.entries(brief.attributes)
            .map(([k, v]) => `${k}=${v}`)
            .join(' · ') || '(none)'
        }`,
      );
      console.log(
        `  req skills     : ${claimed}/${req.length} claimed; missing: ${missing.join(', ') || '(none)'}`,
      );
      console.log(`  opt skills     : ${brief.skills.optional.length}`);
      console.log(
        `  fields         : ${fields.length}  (${fields.filter((f) => f.locator).length} fillable)`,
      );
      for (const f of fields) {
        const flag = f.locator ? ' ' : '✗';
        console.log(`    ${flag} [${f.kind}] ${JSON.stringify(f.question.slice(0, 110))}`);
      }
    }
  });
});
