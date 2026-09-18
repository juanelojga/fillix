import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadEvalConfig, profilePath } from './lib/eval-config.ts';
import { loadOrBuildIndex } from './lib/index-cache.ts';
import { ollamaQueryEmbedder } from './lib/embed-query.ts';
import { loadGoldenSet, toJobBrief, jobOf } from './lib/golden.ts';
import { retrieveFromIndex } from '../src/lib/profile/profile-retrieval';
import { topChunks } from '../src/lib/profile/retrieve';
import { AVAILABILITY_HEADING } from '../src/lib/profile/availability-text';
import { EVIDENCE_CHARS } from '../src/lib/answers/answer-evidence';
import { buildPitchQuery, buildRetrievalQuery } from '../src/lib/answers/answer-query';
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

/**
 * The pitch's half of the same question, and the reason this file covers both.
 *
 * A pitch has no question to embed — `buildPitchQuery` searches on the job itself, the opening
 * of the description plus the same vocabulary a question gets. So "the pitch was written badly"
 * and "the pitch was handed the wrong sections" are two different failures with two different
 * fixes, and only this lane can tell them apart.
 *
 * Labelled by job id against the heading a human reading that posting would reach for. `''` is
 * the same unscored convention the question lane uses: printed, never counted.
 */
const PITCH_CASES: { jobId: string; expect: string }[] = [
  {
    jobId: 'full-stack-python-react-dev-healthcare-technolog',
    expect: 'Python, FastAPI and Django',
  },
  { jobId: 'fe-next-react-developer-for-travel-company', expect: 'React, Next.js and TypeScript' },
  {
    jobId: 'ai-architect-engineer-to-build-a-robust-mvp',
    expect: 'AI and LLM integration in production',
  },
  // KNOWN RED, and left that way. The posting says "multi-tenant SaaS solution" and "connects
  // existing travel platform APIs" in its first two sentences, and the pitch query retrieves
  // neither that section nor either other member of the group this job's pitch case requires —
  // it returns `Employment history`, `Mobile` and `Selected projects` instead, every score
  // inside 0.64–0.68. A long description embeds to something so undiscriminating that the
  // biographical sections win. Bending the label to whatever came back would hide the one
  // result in this lane worth acting on.
  {
    jobId: 'pt-fullstack-developer-solutions-architect-for-a',
    expect: 'Multi-tenant scoping, permissions and billing entitlements',
  },
  {
    jobId: 'react-developer-for-a-concrete-paving-company',
    expect: 'React, Next.js and TypeScript',
  },
  {
    jobId: 'synthetic-pitch-voice-and-name-trap',
    expect: 'React, Next.js and TypeScript',
  },
  // No honest match exists, which is the point of the job. Printed so the ranking on a posting
  // the profile cannot answer is visible — the drafting lane grades what is done about it.
  { jobId: 'synthetic-pitch-no-overlap', expect: '' },
];

const golden = loadGoldenSet();

/**
 * How deep production actually reads, measured rather than assumed: across a full 77-case run
 * the evidence held 4–9 sections, 8 of them typically. Both limits bind at roughly the same
 * depth — `DEFAULT_MAX_CHUNKS` is 8, and `EVIDENCE_CHARS` pays for about seven ~760-character
 * sections — so a rank past this is a section production ranked and never showed.
 */
const TYPICAL_SECTIONS_IN_BUDGET = 8;

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

  it('embeds and ranks every pitch on its job', async () => {
    const embed = ollamaQueryEmbedder(config.embed);
    let hits = 0;
    let scored = 0;

    for (const c of PITCH_CASES) {
      const job = golden.jobs.find((j) => j.id === c.jobId);
      expect(job, `unknown job ${c.jobId}`).toBeDefined();
      if (!job) continue;

      const query = buildPitchQuery(toJobBrief(job));
      const r = await retrieveFromIndex(
        { embedModel: config.embed.model, markdown, index },
        query,
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
      console.log(`  ${mark} ${c.jobId.slice(0, 62).padEnd(62)} → ${top.join(' | ').slice(0, 78)}`);
      if (found === false) console.log(`      wanted: ${c.expect}`);
    }

    console.log(`\n  pitch recall on labelled cases: ${hits}/${scored}\n`);
    expect(scored).toBeGreaterThan(0);
  }, 600_000);

  /**
   * How far down a section the golden set expects actually ranks.
   *
   * `cites-expected` reports a miss as `(not retrieved)`, which names retrieval as the cause
   * but not the fix. Two different faults wear that label: the section ranked just past where
   * `EVIDENCE_CHARS` stopped reading, which is a budget, or it ranked nowhere near the top,
   * which is the query. Only the rank tells them apart, and production never computes one — it
   * takes chunks until the budget runs out and forgets everything it passed over.
   *
   * So this retrieves against a ceiling far above the real budget and reports the position. It
   * is the trap `golden.eval.ts` makes loud, one level deeper: that file checks a `mustCiteAny`
   * heading is a real heading, and a heading that is real but unreachable fails every model
   * identically while reading exactly like a model that will not cite it.
   *
   * Nothing is asserted on a rank. It is a measurement, and failing the suite on one would make
   * every profile edit look like a broken build.
   */
  it('reports where each expected section ranks', async () => {
    const embed = ollamaQueryEmbedder(config.embed);
    // `retrieveFromIndex` never exposes `maxChunks`, and that is the limit that actually binds:
    // raising only the character budget leaves the cap at `DEFAULT_MAX_CHUNKS`, which reports
    // everything past rank 8 as unreachable whatever its score. So the ranking is taken from
    // `topChunks` directly, with both limits lifted past the whole index.
    const graded = golden.cases.filter((c) => (c.expect?.mustCiteAny.length ?? 0) > 0);
    const beyond: string[] = [];

    for (const c of graded) {
      const brief = toJobBrief(jobOf(golden, c));
      // The production query for this kind of case, not the bare question: `buildRetrievalQuery`
      // appends the job's vocabulary, and ranking anything else would grade a retrieval the
      // extension never performs.
      const query =
        c.kind === 'pitch' ? buildPitchQuery(brief) : buildRetrievalQuery(c.question, brief);
      const embedded = await embed(query);
      if (!embedded.ok) continue;
      const ranked = topChunks(
        index,
        embedded.vector,
        Number.MAX_SAFE_INTEGER,
        index.chunks.length,
      );

      const order = [...new Set(ranked.map((k) => k.heading.replace(/ \(\d+\/\d+\)$/, '')))];
      for (const group of c.expect?.mustCiteAny ?? []) {
        // Injected beside the retrieved sections rather than ranked among them, so it has no
        // rank to report and is always available — `shownHeadings` counts it as shown.
        if (group.every((h) => h === AVAILABILITY_HEADING)) continue;
        // Any member satisfies the expectation, so the group ranks where its best member does.
        const ranks = group.map((h) => order.indexOf(h)).filter((i) => i >= 0);
        const best = ranks.length ? Math.min(...ranks) + 1 : null;
        if (best === null || best > TYPICAL_SECTIONS_IN_BUDGET) {
          beyond.push(
            `  ${best === null ? 'unranked' : `rank ${String(best).padStart(2)}`}  ` +
              `${group.join('|').slice(0, 56).padEnd(56)}  ${c.id.slice(-50)}`,
          );
        }
      }
    }

    console.log(
      `\n  expected sections ranking below the ~${TYPICAL_SECTIONS_IN_BUDGET} that fit ` +
        `${EVIDENCE_CHARS} chars — ${beyond.length} of ${graded.length} graded case(s):`,
    );
    for (const line of beyond) console.log(line);
    if (!beyond.length) console.log('  none — every expectation is reachable');
    console.log('');
    expect(graded.length).toBeGreaterThan(0);
  }, 600_000);

  it('gives a pitch with no brief an empty query', () => {
    // The contract the rest of the path rests on: `topChunks` turns '' into [], and
    // `retrieveProfileContext` words that as a refusal rather than as an empty profile. Nothing
    // else covers it, and it needs no index, so it rides along here.
    expect(buildPitchQuery(null)).toBe('');
  });
});
