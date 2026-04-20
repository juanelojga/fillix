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
  | { type: 'CHAT_START'; messages: ChatMessage[]; systemPrompt: string; model?: string }
  | { type: 'CHAT_STOP' }
  | { type: 'OBSIDIAN_LIST_FILES' }
  | { type: 'OBSIDIAN_GET_FILE'; path: string }
  | { type: 'OBSIDIAN_TEST_CONNECTION' }
  | { type: 'OBSIDIAN_WRITE'; path: string; content: string }
  | { type: 'OBSIDIAN_APPEND'; path: string; content: string }
  | { type: 'WORKFLOWS_REFRESH' }
  | { type: 'WORKFLOWS_LIST' };

// Serializable field snapshot (no DOM refs — safe to send via messages)
export interface FieldSnapshot {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  autocomplete?: string;
  currentValue: string;
}

// A proposed fill: field identifier + new value.
// fieldId must be non-empty: prefer FieldSnapshot.id, fall back to FieldSnapshot.name.
// Collectors must not create a FieldFill if both id and name are absent.
export interface FieldFill {
  fieldId: string;
  label: string;
  currentValue: string;
  proposedValue: string;
  editedValue?: string; // set if user edits inline before Apply
}

// Pipeline stage identifiers
export type PipelineStage = 'understand' | 'collect' | 'plan' | 'draft' | 'review';

// Workflow definition (parsed from Obsidian frontmatter + body)
export interface WorkflowDefinition {
  id: string; // vault path (e.g., "workflows/job-application.md")
  name: string;
  taskType: 'form' | 'field-by-field' | 'linkedin-post' | 'rewrite';
  tone: string;
  requiredProfileFields: string[];
  review: boolean;
  logFullOutput: boolean;
  autoApply: boolean;
  systemPrompt: string; // markdown body (below the frontmatter)
}

// Stage output shapes — used by pipeline orchestrator
export interface UnderstandOutput {
  task_type: WorkflowDefinition['taskType'];
  detected_fields: string[];
  confidence: number;
}

export interface PlanOutput {
  fields_to_fill: Array<{ field_id: string; strategy: string }>;
  missing_fields: string[];
  tone: string;
  notes: string;
}

export interface DraftOutput {
  [fieldId: string]: string;
}

export interface ReviewOutput {
  [fieldId: string]: { revised_value: string; change_reason?: string };
}

export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; models: string[] }
  | { ok: true; files: string[] }
  | { ok: true; content: string }
  | { ok: true; workflows: WorkflowDefinition[] }
  | { ok: true }
  | { ok: false; error: string };
