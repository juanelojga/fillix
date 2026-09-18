import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadEvalConfig, profilePath } from './lib/eval-config.ts';
import { loadOrBuildIndex } from './lib/index-cache.ts';
import { ollamaQueryEmbedder } from './lib/embed-query.ts';
import { retrieveFromIndex } from '../src/lib/profile/profile-retrieval';
import { EVIDENCE_CHARS } from '../src/lib/answers/answer-evidence';
import type { ProfileIndex } from '../src/lib/storage';

/**
 * Retrieval on its own, before any drafting.
 *
 * Worth its own file because a bad answer has two possible causes and they need different
 * fixes: the model wrote badly, or it was handed the wrong sections. Checking the ranking
 * separately means a drafting failure can never be blamed on the wrong half.
 */
const config = loadEvalConfig();
const markdown = readFileSync(profilePath('profile.md'), 'utf8');

/** Real questions lifted from the captures, paired with the heading a human would cite. */
const CASES: { question: string; expect: string }[] = [
  {
    question: 'Describe your experience with Python (Django, FastAPI) and React.',
    expect: 'Python, FastAPI and Django',
  },
  {
    question: 'What is your level of experience with React? Please describe how you have used it.',
    expect: 'React, Next.js and TypeScript',
  },
  {
    question:
      'What is your production experience using AI/LLM reasoning and providers, and their costs and optimization usage?',
    expect: 'LLM cost discipline',
  },
  {
    question:
      'Can you describe your approach to reviewing PostgreSQL Row-Level Security (RLS) policies?',
    expect: 'PostgreSQL and data modelling',
  },
  {
    question: 'Have you shipped and maintained multi-tenant SaaS to production?',
    expect: 'Multi-tenant scoping, permissions and billing entitlements',
  },
  { question: 'Do you happen to be a Spanish speaker?', expect: 'Languages' },
  {
    question: 'Where are you based now, and how many overlap hours can you provide for the job?',
    expect: '',
  },
  { question: 'Please provide your experience with A/B testing.', expect: '' },
];

let index: ProfileIndex;

describe('profile retrieval against a live index', () => {
  beforeAll(async () => {
    const built = await loadOrBuildIndex({
      markdown,
      baseUrl: config.embed.baseUrl,
      embedModel: config.embed.model,
    });
    index = built.index;
    console.log(
      `\n  index: ${index.chunks.length} chunks · ${index.dim} dims · ${built.built ? 'BUILT' : 'cached'}\n`,
    );
  }, 600_000);

  it('embeds and ranks every question', async () => {
    const embed = ollamaQueryEmbedder(config.embed);
    let hits = 0;
    let scored = 0;

    for (const c of CASES) {
      const r = await retrieveFromIndex(
        { embedModel: config.embed.model, markdown, index },
        c.question,
        EVIDENCE_CHARS,
        embed,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) continue;

      const headings = r.chunks.map((k) => k.heading.replace(/ \(\d+\/\d+\)$/, ''));
      const top = [...new Set(headings)].slice(0, 3);
      const found = c.expect === '' ? null : headings.some((h) => h === c.expect);
      if (found !== null) {
        scored += 1;
        if (found) hits += 1;
      }

      const mark = found === null ? '·' : found ? '✓' : '✗';
      console.log(
        `  ${mark} ${c.question.slice(0, 62).padEnd(62)} → ${top.join(' | ').slice(0, 78)}`,
      );
      if (found === false) console.log(`      wanted: ${c.expect}`);
    }

    console.log(`\n  recall on labelled cases: ${hits}/${scored}\n`);
    expect(scored).toBeGreaterThan(0);
  }, 600_000);
});
