/**
 * The closed sets a model reply is validated against: pillars, styles, funnel stages and
 * ICPs.
 *
 * Deliberately not inside `src/prompts/linkedin-voice.md`, for the reason
 * `toptal-job-skills.ts` sits apart from `toptal-job-attributes.ts`: the two read the same
 * subject for different consumers. The `.md` describes a pillar in prose, **for the model**,
 * and the user is free to rewrite every word of it. This file holds the ids a `normalize*`
 * rejects against, and changing one of those breaks a parser.
 *
 * `post-taxonomy.spec.ts` asserts every id here literally appears in the packaged `.md`, so
 * the two drifting apart is a failed test rather than a brief that is silently refused.
 */

export const PILLARS = [
  'architecture',
  'javascript',
  'python',
  'startups',
  'consulting',
  'career',
] as const;
export type PillarId = (typeof PILLARS)[number];

export const STYLES = [
  'actionable',
  'observational',
  'contrarian',
  'analytical',
  'lessons-learned',
  'listicle',
  'comparison',
] as const;
export type StyleId = (typeof STYLES)[number];

export const FUNNEL_STAGES = ['tofu', 'mofu', 'bofu'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const ICPS = ['primary', 'non-technical-founder', 'saas-leader', 'agency-owner'] as const;
export type IcpId = (typeof ICPS)[number];

/** Short labels for the panel. The `.md` carries the descriptions; these are chips. */
export const PILLAR_LABEL: Record<PillarId, string> = {
  architecture: 'Architecture',
  javascript: 'JavaScript',
  python: 'Python',
  startups: 'Startups',
  consulting: 'Consulting',
  career: 'Career',
};

/**
 * Which styles each funnel stage admits.
 *
 * This is the one cross-field rule `normalizeAngleBrief` enforces, and the reason it is a
 * table rather than prose: a model can answer `{"funnel":"tofu","style":"actionable"}` with
 * both fields individually valid and the pair wrong. No self-report catches that, because
 * the model wrote the two fields separately.
 *
 * BOFU admits every style on purpose — its constraint is on the close, not on the style.
 */
export const FUNNEL_STYLES: Record<FunnelStage, readonly StyleId[]> = {
  tofu: ['observational', 'contrarian', 'lessons-learned', 'listicle'],
  mofu: ['actionable', 'analytical', 'comparison'],
  bofu: STYLES,
};

/**
 * Vocabulary appended to a retrieval query, per pillar.
 *
 * A topic like "Most architecture diagrams are wish-lists disguised as plans" names no
 * technology at all, so on its own it retrieves whichever profile section reads most like
 * an opinion. These are the words the CV actually uses — the same argument
 * `buildRetrievalQuery` makes about a job's required skills.
 */
export const PILLAR_QUERY_TERMS: Record<PillarId, string[]> = {
  architecture: ['system design', 'monolith', 'services', 'migration', 'scaling', 'data model'],
  javascript: ['Node', 'React', 'TypeScript', 'frontend', 'API', 'bundler'],
  python: ['Python', 'FastAPI', 'Django', 'Celery', 'pandas', 'async'],
  startups: ['MVP', 'scope', 'roadmap', 'shipping', 'prototype', 'founder'],
  consulting: ['client', 'contract', 'freelance', 'engagement', 'estimate', 'handover'],
  career: ['team', 'mentoring', 'code review', 'hiring', 'lead', 'career'],
};

export function isPillar(value: unknown): value is PillarId {
  return typeof value === 'string' && (PILLARS as readonly string[]).includes(value);
}

export function isStyle(value: unknown): value is StyleId {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value);
}

export function isFunnelStage(value: unknown): value is FunnelStage {
  return typeof value === 'string' && (FUNNEL_STAGES as readonly string[]).includes(value);
}

export function isIcp(value: unknown): value is IcpId {
  return typeof value === 'string' && (ICPS as readonly string[]).includes(value);
}
