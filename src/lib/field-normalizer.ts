import type { DraftOutput, FieldFill, FieldSnapshot, ReviewOutput } from '../types';

const META_KEYS = new Set([
  'field_id',
  'value',
  'revised_value',
  'change_reason',
  'analysis',
  'issues_found',
  'action',
  'task',
  'input',
  'notes',
  'context',
  'constraints',
]);

export function normalizeDraft(raw: DraftOutput): DraftOutput {
  const obj = raw as Record<string, unknown>;
  if (typeof obj['field_id'] === 'string' && typeof obj['value'] === 'string') {
    return { [obj['field_id'] as string]: obj['value'] as string };
  }
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => !META_KEYS.has(k) && typeof v === 'string'),
  ) as DraftOutput;
}

export function normalizeReview(raw: ReviewOutput): ReviewOutput {
  const obj = raw as Record<string, unknown>;
  if (typeof obj['field_id'] === 'string' && typeof obj['revised_value'] === 'string') {
    return {
      [obj['field_id'] as string]: {
        revised_value: obj['revised_value'] as string,
        change_reason: obj['change_reason'] as string | undefined,
      },
    };
  }
  const result: ReviewOutput = {};
  for (const [key, val] of Object.entries(obj)) {
    if (META_KEYS.has(key) || val === null || val === undefined) continue;
    if (typeof val === 'string') {
      result[key] = { revised_value: val };
    } else if (typeof val === 'object' && 'revised_value' in (val as object)) {
      result[key] = val as { revised_value: string; change_reason?: string };
    }
  }
  return result;
}

export function buildFieldFills(
  output: DraftOutput | ReviewOutput,
  isReview: boolean,
  fields: FieldSnapshot[],
): FieldFill[] {
  const snapMap = new Map(fields.map((f) => [f.id ?? f.name ?? '', f]));
  const normalized = isReview
    ? normalizeReview(output as ReviewOutput)
    : normalizeDraft(output as DraftOutput);

  return Object.entries(normalized)
    .map(([fieldId, val]) => {
      let proposedValue: string;
      if (isReview) {
        const rv = val as { revised_value?: string } | string;
        proposedValue = typeof rv === 'string' ? rv : (rv.revised_value ?? '');
      } else {
        proposedValue = typeof val === 'string' ? val : '';
      }
      const snap = snapMap.get(fieldId);
      return {
        fieldId,
        label: snap?.label ?? fieldId,
        currentValue: snap?.currentValue ?? '',
        proposedValue,
      };
    })
    .filter(({ proposedValue }) => proposedValue.length > 0);
}
