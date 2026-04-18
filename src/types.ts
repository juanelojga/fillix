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

export interface ObsidianConfig {
  host: string;
  port: number;
  apiKey: string;
  systemPromptPath?: string;
}

export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext }
  | { type: 'OLLAMA_LIST_MODELS' }
  | { type: 'CHAT_START'; messages: ChatMessage[]; systemPrompt: string; model: string }
  | { type: 'CHAT_STOP' }
  | { type: 'OBSIDIAN_LIST_FILES' }
  | { type: 'OBSIDIAN_GET_FILE'; path: string }
  | { type: 'OBSIDIAN_TEST_CONNECTION' };

export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; models: string[] }
  | { ok: true; files: string[] }
  | { ok: true; content: string }
  | { ok: true }
  | { ok: false; error: string };
