import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import {
  HOOK_LINES,
  MAX_HOOK_CHARS,
  MIN_HOOKS,
  briefSystemPrompt,
  buildBriefPrompt,
  type BriefPromptInput,
} from './brief-prompt';
import { POST_NUM_CTX } from './post-budget';
import {
  FUNNEL_STYLES,
  isFunnelStage,
  isIcp,
  isPillar,
  isStyle,
  type FunnelStage,
  type IcpId,
  type PillarId,
  type StyleId,
} from './post-taxonomy';

/** Stage 2: who the post is for, what it argues, and three ways to open it. */

export const BRIEF_NUM_PREDICT = 1_024;
export const BRIEF_TIMEOUT_MS = 120_000;

const MAX_TRIGGER_CHARS = 40;

export interface HookVariant {
  /** Exactly three lines, each non-empty. Re-counted here, never trusted. */
  lines: [string, string, string];
  /** Free text, deliberately not a closed union — see `normalizeAngleBrief`. */
  trigger: string;
}

export interface AngleBrief {
  icp: IcpId;
  pillar: PillarId;
  style: StyleId;
  funnel: FunnelStage;
  spike: string;
  hooks: HookVariant[];
}

export async function writeBrief(
  config: OllamaConfig,
  input: BriefPromptInput & { voiceSpec: string },
  signal: AbortSignal,
): Promise<AngleBrief> {
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    briefSystemPrompt(input.voiceSpec),
    buildBriefPrompt(input),
    signal,
    { num_ctx: POST_NUM_CTX, num_predict: BRIEF_NUM_PREDICT },
  );
  return normalizeAngleBrief(raw);
}

export function hookLength(hook: HookVariant): number {
  return hook.lines.join('\n').length;
}

/**
 * One hook, or null.
 *
 * Dropped rather than truncated when it runs long: cutting a hook mid-word is worse than
 * showing two good ones, and `MAX_HOOK_CHARS` is exactly the kind of self-reported number a
 * model will claim to have honoured. It is re-counted here.
 */
function normalizeHook(value: unknown): HookVariant | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;

  const raw = Array.isArray(item['lines']) ? item['lines'] : [];
  const lines = raw
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== HOOK_LINES) return null;

  const trigger = typeof item['trigger'] === 'string' ? item['trigger'].trim() : '';
  if (!trigger || trigger.length > MAX_TRIGGER_CHARS) return null;

  const hook: HookVariant = { lines: [lines[0], lines[1], lines[2]], trigger };
  return hookLength(hook) <= MAX_HOOK_CHARS ? hook : null;
}

/**
 * The single place the brief's shape is enforced.
 *
 * The cross-field guard is the point of this function. A model can answer
 * `{"funnel":"tofu","style":"actionable"}` with both fields individually valid and the pair
 * wrong — the voice spec maps TOFU to observational, contrarian, lessons-learned and listicle,
 * and actionable to MOFU. No self-report catches that, because the model wrote the two fields
 * separately and has no reason to notice they disagree.
 *
 * `trigger` is deliberately **not** validated against a closed list. `pillar`, `style`,
 * `funnel` and `icp` are branched on downstream; `trigger` is a label a human reads when
 * picking a hook, and closing it would reject "loss aversion" for not appearing in a list we
 * invented.
 */
export function normalizeAngleBrief(raw: Record<string, unknown>): AngleBrief {
  const { icp, pillar, style, funnel } = raw;
  const spike = typeof raw['spike'] === 'string' ? raw['spike'].trim() : '';

  const hooks = (Array.isArray(raw['hooks']) ? raw['hooks'] : [])
    .map(normalizeHook)
    .filter((hook): hook is HookVariant => hook !== null);

  const ok =
    isIcp(icp) &&
    isPillar(pillar) &&
    isStyle(style) &&
    isFunnelStage(funnel) &&
    FUNNEL_STYLES[funnel].includes(style) &&
    spike !== '' &&
    hooks.length >= MIN_HOOKS;

  // One message for every shape failure, matched by `post-diagnostics.ts`'s `bad-brief` arm.
  // Naming which field failed would be friendlier and is not worth a second arm: the user's
  // next step is the same in every case, and the raw reply is carried in `detail`.
  if (!ok) {
    throw new Error('The model returned an unusable angle brief');
  }

  return { icp, pillar, style, funnel, spike, hooks };
}
