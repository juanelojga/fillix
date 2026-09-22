import type { OllamaConfig } from '../../types';
import { generateStructured } from '../ollama';
import { auditSystemPrompt, buildAuditPrompt } from './audit-prompt';
import { POST_NUM_CTX } from './post-budget';
import { MODEL_ROW_IDS, type AuditRow, type AuditRowId } from './post-audit';
import type { PostDraft } from './post-draft';
import type { AngleBrief } from './write-brief';

/** The four rows a regex cannot settle, asked of the model and then distrusted. */

export const AUDIT_NUM_PREDICT = 512;

export async function judgePost(
  config: OllamaConfig,
  draft: PostDraft,
  brief: AngleBrief,
  voiceSpec: string,
  signal: AbortSignal,
): Promise<AuditRow[]> {
  const raw = await generateStructured<Record<string, unknown>>(
    config,
    auditSystemPrompt(voiceSpec),
    buildAuditPrompt(draft, brief),
    signal,
    { num_ctx: POST_NUM_CTX, num_predict: AUDIT_NUM_PREDICT },
  );
  return normalizeAuditVerdicts(raw);
}

function isModelRow(value: unknown): value is AuditRowId {
  return typeof value === 'string' && (MODEL_ROW_IDS as readonly string[]).includes(value);
}

/**
 * The single place a verdict's shape is enforced.
 *
 * `pass` must be a real boolean. A string `"true"` is **dropped, not coerced**: a model that
 * stringifies a boolean is one whose judgement should not be read, and coercing it would turn
 * a confused reply into a confident pass. A failure with no `why` is dropped too — it produces
 * no located note, so the repair would be aimed at nothing.
 *
 * A row this drops stays failing in `mergeAuditReport`, which is the safe direction: the user
 * sees an amber row rather than a green one nobody checked.
 */
export function normalizeAuditVerdicts(raw: Record<string, unknown>): AuditRow[] {
  const rows = Array.isArray(raw['verdicts']) ? raw['verdicts'] : [];
  const seen = new Set<AuditRowId>();
  const verdicts: AuditRow[] = [];

  for (const entry of rows) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;

    if (!isModelRow(item['row']) || seen.has(item['row'])) continue;
    if (typeof item['pass'] !== 'boolean') continue;

    const why = typeof item['why'] === 'string' ? item['why'].trim() : '';
    if (!item['pass'] && !why) continue;

    seen.add(item['row']);
    verdicts.push({ id: item['row'], pass: item['pass'], why: item['pass'] ? '' : why });
  }

  return verdicts;
}
