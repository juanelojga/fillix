import type { FieldContext, OllamaConfig, UserProfile } from '../types';

export async function listModels(config: OllamaConfig): Promise<string[]> {
  const res = await fetch(`${config.baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
  const data = (await res.json()) as { models: { name: string }[] };
  return data.models.map((m) => m.name);
}

export async function inferFieldValue(
  config: OllamaConfig,
  field: FieldContext,
  profile: UserProfile,
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: buildPrompt(field, profile),
      stream: false,
      format: 'json',
    }),
  });
  if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
  const data = (await res.json()) as { response: string };
  try {
    const parsed = JSON.parse(data.response) as { value?: string };
    return parsed.value ?? '';
  } catch {
    return '';
  }
}

function buildPrompt(field: FieldContext, profile: UserProfile): string {
  return [
    'You are helping fill a web form. Given a form field and a user profile, pick the best profile value for the field.',
    'Respond with JSON only in the shape {"value": "<best value or empty string>"}. Do not invent data.',
    `Field: ${JSON.stringify(field)}`,
    `Profile: ${JSON.stringify(profile)}`,
  ].join('\n');
}
