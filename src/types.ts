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

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type PortMessage =
  | { type: 'token'; value: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext; profile: UserProfile }
  | { type: 'OLLAMA_LIST_MODELS' }
  | { type: 'CHAT_START'; messages: ChatMessage[]; systemPrompt: string; model: string }
  | { type: 'CHAT_STOP' };

export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; models: string[] }
  | { ok: true }
  | { ok: false; error: string };
