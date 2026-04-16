export interface UserProfile {
  [key: string]: string | undefined;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface FieldContext {
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  autocomplete?: string;
}

export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext; profile: UserProfile }
  | { type: 'OLLAMA_LIST_MODELS' };

export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; models: string[] }
  | { ok: false; error: string };
