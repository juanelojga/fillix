import { generateStructured } from './ollama';
import type {
  ConversationMessage,
  DraftOutput,
  FieldSnapshot,
  OllamaConfig,
  PlanOutput,
  ReviewOutput,
  UnderstandOutput,
  WorkflowDefinition,
} from '../types';

export function stripThinking(raw: string): string {
  if (!raw.includes('</thinking>')) return raw;
  return raw.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
}

async function withRetry<T>(
  stage: string,
  generate: (extraHint?: string) => Promise<T>,
): Promise<T> {
  try {
    return await generate();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    console.warn('[fillix] pipeline retry:', stage);
    const hint = err instanceof Error ? err.message : String(err);
    try {
      return await generate(hint);
    } catch (err2) {
      if (err2 instanceof Error && err2.name === 'AbortError') throw err2;
      throw new Error(
        `[fillix] ${stage} failed after retry: ${err2 instanceof Error ? err2.message : String(err2)}`,
      );
    }
  }
}

function trimFields(fields: FieldSnapshot[]): { label?: string; type?: string }[] {
  return fields.map(({ label, type }) => ({ label, type }));
}

function fieldsPayload(fields: FieldSnapshot[]): unknown {
  return fields.length > 15 ? trimFields(fields) : fields;
}

const PLAN_FEW_SHOT = `
Examples of good plan output (think step-by-step, then return valid JSON only):

<thinking>Login form — only needs email and password. Skip password per policy.</thinking>
{"fields_to_fill":[{"field_id":"email","strategy":"use profile.email"}],"missing_fields":[],"tone":"neutral","notes":"password field skipped"}

<thinking>Job application — needs name, email, cover letter. Tone is professional.</thinking>
{"fields_to_fill":[{"field_id":"name","strategy":"use profile.name"},{"field_id":"email","strategy":"use profile.email"},{"field_id":"cover_letter","strategy":"compose from profile experience"}],"missing_fields":[],"tone":"professional","notes":""}

<thinking>WhatsApp reply — reading last message to compose a contextual response.</thinking>
{"fields_to_fill":[],"missing_fields":[],"tone":"casual","notes":"message-reply mode: compose reply from conversation context"}

IMPORTANT: output <thinking> first, then valid JSON only.
`.trim();

const DRAFT_FEW_SHOT = `
Examples of good draft output (think step-by-step, then return valid JSON only):

<thinking>Name field: use full name from profile.</thinking>
{"name":"Juan Almeida"}

<thinking>Cover letter: synthesise experience from profile into 2 sentences.</thinking>
{"cover_letter":"Experienced software engineer with 8 years in full-stack development. Passionate about building user-facing products."}

<thinking>WhatsApp reply: respond to their greeting warmly.</thinking>
{"reply":"Hey! Great to hear from you — happy to chat."}

IMPORTANT: output <thinking> first, then valid JSON only.
`.trim();

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
  opts?: { feedback?: string; conversation?: ConversationMessage[] },
): Promise<PlanOutput> {
  const profile = profileText.slice(0, 2000);
  const systemPrompt = [workflow.systemPrompt, PLAN_FEW_SHOT].join('\n\n');

  const buildUserPrompt = (extraHint?: string): string => {
    const parts = [
      `Profile:\n${profile}`,
      `Detected task: ${understand.task_type}, confidence: ${understand.confidence}`,
      `Fields: ${JSON.stringify(fieldsPayload(fields))}`,
      `Tone: ${workflow.tone}`,
    ];

    if (opts?.conversation?.length) {
      const thread = opts.conversation
        .map((m) => `${m.sender === 'me' ? 'Me' : 'Them'}: ${m.text}`)
        .join('\n');
      parts.push(`Conversation context:\n${thread}`);
    }

    parts.push(
      'Plan which fields to fill, which are missing from the profile, and the tone.',
      'Return JSON: {"fields_to_fill":[{"field_id":"...","strategy":"..."}],"missing_fields":[...],"tone":"...","notes":"..."}.',
      'Never fill password, file, or hidden fields. Only use data present in the profile.',
    );

    if (opts?.feedback) {
      parts.push(`User feedback on previous plan: ${opts.feedback}`);
    }

    if (extraHint) {
      parts.push(`Previous attempt failed: ${extraHint}\nPlease return valid JSON only.`);
    }

    return parts.join('\n');
  };

  return withRetry('plan', (hint) =>
    generateStructured<PlanOutput>(config, systemPrompt, buildUserPrompt(hint), signal),
  );
}

export async function runDraft(
  config: OllamaConfig,
  workflow: WorkflowDefinition,
  fields: FieldSnapshot[],
  plan: PlanOutput,
  signal?: AbortSignal,
  opts?: { feedback?: string; conversation?: ConversationMessage[] },
): Promise<DraftOutput> {
  const systemPrompt = [workflow.systemPrompt, DRAFT_FEW_SHOT].join('\n\n');

  const buildUserPrompt = (extraHint?: string): string => {
    const parts = [
      `Fields: ${JSON.stringify(fieldsPayload(fields))}`,
      `Plan: ${JSON.stringify(plan)}`,
      'Write the best value for each field based on the plan.',
      'Return a JSON object where each key is one of the actual field_id strings from the Fields list above, and each value is the proposed text string.',
      'Use the exact field_id strings as keys — do not use the word "field_id" as a key. Example: {"matcherQuestionsAnswers[abc]": "some text"}.',
      'Never fill password, file, or hidden fields. Only use data from the plan.',
    ];

    if (opts?.conversation?.length) {
      const thread = opts.conversation
        .map((m) => `${m.sender === 'me' ? 'Me' : 'Them'}: ${m.text}`)
        .join('\n');
      parts.push(`Conversation context:\n${thread}`);
    }

    if (opts?.feedback) {
      parts.push(`User feedback on previous draft: ${opts.feedback}`);
    }

    if (extraHint) {
      parts.push(`Previous attempt failed: ${extraHint}\nPlease return valid JSON only.`);
    }

    return parts.join('\n');
  };

  return withRetry('draft', (hint) =>
    generateStructured<DraftOutput>(config, systemPrompt, buildUserPrompt(hint), signal),
  );
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
    'Return a JSON object where each key is one of the actual field_id strings from Draft values above, and each value is {"revised_value":"...","change_reason":"..."}.',
    'Use the exact field_id strings as keys — do not use the word "field_id" as a key. Example: {"matcherQuestionsAnswers[abc]": {"revised_value": "...", "change_reason": "..."}}.',
    'Omit change_reason if no change was needed. Never invent data not present in the draft.',
  ].join('\n');
  return generateStructured<ReviewOutput>(config, workflow.systemPrompt, userPrompt, signal);
}
