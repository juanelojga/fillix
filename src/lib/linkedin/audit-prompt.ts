import { MODEL_ROW_IDS, rowSpec, type AuditRow } from './post-audit';
import type { PostDraft } from './post-draft';
import type { AngleBrief } from './write-brief';

/**
 * The prompts for the four rows a regex cannot settle, and for the repair.
 *
 * Two prompts in one file because they are two halves of one exchange — the judge names where
 * a row failed, and the repair carries that location back with **our** instruction attached.
 * They are reworded together or not at all.
 */

export const AUDIT_ENVELOPE =
  'Respond with JSON only: {"verdicts":[{"row":"<id>","pass":true,"why":"..."}]}';

export function auditSystemPrompt(voiceSpec: string): string {
  return [
    'You review one LinkedIn post against four rules, on behalf of its author. You are not rewriting it.',
    '',
    "=== The author's positioning, voice and rules ===",
    voiceSpec,
    '=== end ===',
    '',
    'Judge exactly these rows, and no others:',
    ...MODEL_ROW_IDS.map((id) => `- "${id}": ${rowSpec(id).label}`),
    '',
    '"pass" is a real boolean, true or false — never the word "true" in quotes.',
    '"why" names WHERE the row fails: quote the sentence or name the paragraph. On a pass, leave it empty.',
    'Be strict. A claim with no number, no named tool and no named moment fails "specific-claims" even if it sounds true.',
    'Do not suggest fixes. Do not rewrite anything. Judge only.',
    AUDIT_ENVELOPE,
    `Again: one verdict per row, only these ids — ${MODEL_ROW_IDS.join(' | ')} — and "pass" is a boolean.`,
  ].join('\n');
}

export function buildAuditPrompt(draft: PostDraft, brief: AngleBrief): string {
  return [
    `This post was written for the ${brief.funnel} stage, aimed at ${brief.icp}, in the ${brief.style} style.`,
    `The argument it is meant to carry: ${brief.spike}`,
    '',
    'The post:',
    draft.text,
  ].join('\n');
}

export function repairSystemPrompt(voiceSpec: string): string {
  return [
    'You revise one LinkedIn post, in the first person, as its author. Everything you need to know about them is below.',
    '',
    "=== The author's positioning, voice and rules ===",
    voiceSpec,
    '=== end ===',
    '',
    'Fix only what you are told to fix. Change nothing else.',
    'Keep the hook exactly as it is — return it unchanged.',
    'Never invent a client name, an employer, a date, a tool or a number to satisfy a fix. If a fix cannot be made honestly, cut the sentence instead.',
    'Respond with JSON only: {"hook":"...","body":"...","close":"..."}',
    'Again: fix only the numbered items below, keep the hook unchanged, and invent nothing.',
  ].join('\n');
}

/**
 * The repair instruction is **ours**; only the location comes from the judge.
 *
 * A model that hallucinates a rationale therefore steers where a fix is applied, never what
 * the fix is — which is the same division of labour the whole extraction path rests on.
 */
export function buildRepairPrompt(draft: PostDraft, failures: AuditRow[]): string {
  const items = failures.map((row, index) => {
    const spec = rowSpec(row.id);
    const located = row.why ? `\n   (the reviewer noted: ${row.why})` : '';
    return `${index + 1}. ${spec.label}.\n   ${spec.repair}${located}`;
  });

  return [
    'Fix these, and change nothing else.',
    '',
    ...items,
    '',
    'The post as it stands:',
    draft.text,
  ].join('\n');
}
