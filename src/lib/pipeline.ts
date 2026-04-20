import { generateStructured } from './ollama';
import type {
  DraftOutput,
  FieldSnapshot,
  OllamaConfig,
  PlanOutput,
  ReviewOutput,
  UnderstandOutput,
  WorkflowDefinition,
} from '../types';

function trimFields(fields: FieldSnapshot[]): { label?: string; type?: string }[] {
  return fields.map(({ label, type }) => ({ label, type }));
}

function fieldsPayload(fields: FieldSnapshot[]): unknown {
  return fields.length > 15 ? trimFields(fields) : fields;
}

export async function runUnderstand(
  config: OllamaConfig,
  workflow: WorkflowDefinition,
  fields: FieldSnapshot[],
  pageUrl: string,
  signal?: AbortSignal,
): Promise<UnderstandOutput> {
  const userPrompt = [
    `Page URL: ${pageUrl}`,
    `Detected fields: ${JSON.stringify(fieldsPayload(fields))}`,
    'Analyse the form task type, list detected field IDs, and rate confidence (0–1).',
    'Return JSON: {"task_type":"form|field-by-field|linkedin-post|rewrite","detected_fields":["id",...],"confidence":0.0}.',
    'Never fill password, file, or hidden fields. Only use data present in the profile.',
  ].join('\n');
  return generateStructured<UnderstandOutput>(config, workflow.systemPrompt, userPrompt, signal);
}

export async function runPlan(
  config: OllamaConfig,
  workflow: WorkflowDefinition,
  fields: FieldSnapshot[],
  understand: UnderstandOutput,
  profileText: string,
  signal?: AbortSignal,
): Promise<PlanOutput> {
  const profile = profileText.slice(0, 2000);
  const userPrompt = [
    `Profile:\n${profile}`,
    `Detected task: ${understand.task_type}, confidence: ${understand.confidence}`,
    `Fields: ${JSON.stringify(fieldsPayload(fields))}`,
    `Tone: ${workflow.tone}`,
    'Plan which fields to fill, which are missing from the profile, and the tone.',
    'Return JSON: {"fields_to_fill":[{"field_id":"...","strategy":"..."}],"missing_fields":[...],"tone":"...","notes":"..."}.',
    'Never fill password, file, or hidden fields. Only use data present in the profile.',
  ].join('\n');
  return generateStructured<PlanOutput>(config, workflow.systemPrompt, userPrompt, signal);
}

export async function runDraft(
  config: OllamaConfig,
  workflow: WorkflowDefinition,
  fields: FieldSnapshot[],
  plan: PlanOutput,
  signal?: AbortSignal,
): Promise<DraftOutput> {
  const userPrompt = [
    `Fields: ${JSON.stringify(fieldsPayload(fields))}`,
    `Plan: ${JSON.stringify(plan)}`,
    'Write the best value for each field based on the plan.',
    'Return JSON mapping field_id to its proposed value: {"field_id":"value",...}.',
    'Never fill password, file, or hidden fields. Only use data from the plan.',
  ].join('\n');
  return generateStructured<DraftOutput>(config, workflow.systemPrompt, userPrompt, signal);
}

export async function runReview(
  config: OllamaConfig,
  workflow: WorkflowDefinition,
  draft: DraftOutput,
  plan: PlanOutput,
  signal?: AbortSignal,
): Promise<ReviewOutput> {
  const userPrompt = [
    `Draft values: ${JSON.stringify(draft)}`,
    `Plan: ${JSON.stringify(plan)}`,
    `Target tone: ${plan.tone}`,
    'Review each draft value for tone, accuracy, and completeness. Revise where needed.',
    'Return JSON: {"field_id":{"revised_value":"...","change_reason":"..."},...}.',
    'Omit change_reason if no change was needed. Never invent data not present in the draft.',
  ].join('\n');
  return generateStructured<ReviewOutput>(config, workflow.systemPrompt, userPrompt, signal);
}
