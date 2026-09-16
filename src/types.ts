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

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PortMessage =
  | { type: 'token'; value: string }
  | { type: 'thinking'; value: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'tool-call'; toolName: string; args: Record<string, string> }
  | { type: 'tool-result'; toolName: string; result: string };

export interface ObsidianConfig {
  host: string;
  port: number;
  apiKey: string;
  systemPromptPath?: string;
}

// ---------------------------------------------------------------------------
// News tab
// ---------------------------------------------------------------------------

export type NewsCategory = 'ai' | 'technology' | 'software-development' | 'curiosities';

/** One collapsed News row. Every field renders as-is — the UI never switches on source. */
export interface NewsItem {
  /** Source-prefixed and stable across refreshes: `hn:41234567`, `wiki:mostread:3`. */
  id: string;
  category: NewsCategory;
  title: string;
  /** Real publisher URL. Never empty — HN self-posts fall back to the HN item page. */
  url: string;
  /** Display origin: 'techcrunch.com', 'Wikipedia'. */
  source: string;
  /** Pre-rendered row meta: '120 points · 34 comments · 2h ago'. */
  meta: string;
  /** ISO 8601 string, not Date — sendMessage serializes through JSON. */
  publishedAt: string;
  /** Text the feed already provided (HN story_text, Wikipedia extract). May be ''. */
  snippet: string;
}

export interface NewsSummary {
  summary: string;
  keyPoints: string[];
}

export interface NewsSourceFailure {
  category: NewsCategory;
  source: string;
  error: string;
}

/** Where the text handed to the summarizer came from. */
export type NewsArticleText = { text: string; origin: 'snippet' | 'article' };

export type Message =
  | { type: 'OLLAMA_INFER'; field: FieldContext }
  | { type: 'TEST_MODEL'; model: string }
  | {
      type: 'CHAT_START';
      messages: ChatMessage[];
      systemPrompt: string;
      model?: string;
    }
  | { type: 'CHAT_STOP' }
  | { type: 'OBSIDIAN_LIST_FILES' }
  | { type: 'OBSIDIAN_GET_FILE'; path: string }
  | { type: 'OBSIDIAN_TEST_CONNECTION' }
  | { type: 'OBSIDIAN_WRITE'; path: string; content: string }
  | { type: 'OBSIDIAN_APPEND'; path: string; content: string }
  | { type: 'WORKFLOWS_REFRESH' }
  | { type: 'WORKFLOWS_LIST' }
  | { type: 'DETECT_FIELDS'; tabId: number }
  | { type: 'APPLY_FIELDS'; tabId: number; fieldMap: FieldFill[] }
  // Gate messages (bg ↔ sidepanel port)
  | { type: 'AGENTIC_PLAN_REVIEW'; plan: PlanOutput }
  | { type: 'AGENTIC_PLAN_FEEDBACK'; approved: true }
  | { type: 'AGENTIC_PLAN_FEEDBACK'; approved: false; feedback: string }
  | { type: 'AGENTIC_FILLS_REVIEW'; kind: 'form'; fills: FieldFill[] }
  | { type: 'AGENTIC_FILLS_REVIEW'; kind: 'reply'; replyText: string }
  | { type: 'AGENTIC_FILLS_FEEDBACK'; approved: true }
  | { type: 'AGENTIC_FILLS_FEEDBACK'; approved: false; feedback: string }
  | {
      type: 'AGENTIC_SUMMARY';
      applied: number;
      skipped: number;
      durationMs: number;
      wordCount?: number;
    }
  // Conversation extraction (bg → content script)
  | { type: 'EXTRACT_CONVERSATION' }
  | { type: 'CONVERSATION_DATA'; messages: ConversationMessage[]; platform: string | null }
  // Text insertion (bg → content script)
  | { type: 'INSERT_TEXT'; text: string }
  // News tab (sidepanel → bg, one-shot request/response)
  | { type: 'NEWS_REFRESH' }
  | { type: 'NEWS_ARTICLE'; item: NewsItem }
  | { type: 'NEWS_SUMMARIZE'; title: string; source: string; text: string };

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
export type PipelineStage =
  | 'understand'
  | 'collect'
  | 'plan'
  | 'draft'
  | 'review'
  | 'plan-review'
  | 'fills-review';

// A single message in a conversation thread (WhatsApp, LinkedIn, etc.)
export interface ConversationMessage {
  sender: 'me' | 'them';
  text: string;
}

// Workflow definition (parsed from Obsidian frontmatter + body)
export interface WorkflowDefinition {
  id: string; // vault path (e.g., "workflows/job-application.md")
  name: string;
  taskType: 'form' | 'field-by-field' | 'linkedin-post' | 'rewrite' | 'message-reply';
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

// Thread message variants for the Workflow tab chat-like UI
export type AgentThreadMessage =
  | { kind: 'plan-review'; plan: PlanOutput }
  | { kind: 'fills-review'; subKind: 'form'; fills: FieldFill[] }
  | { kind: 'fills-review'; subKind: 'reply'; replyText: string }
  | { kind: 'user-feedback'; text: string }
  | { kind: 'summary'; applied: number; skipped: number; durationMs: number; wordCount?: number }
  | { kind: 'error'; stage: PipelineStage; error: string };

// Success arms are distinguished ONLY by payload key shape (narrowed with `'key' in r`).
// Never reuse an existing key name with a different value type: it cross-wires silently
// with no compiler diagnostic. Taken: value, latencyMs, files, content, workflows,
// fields, applied, messages, platform, news, degraded, article, summary.
export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; latencyMs: number }
  | { ok: true; files: string[] }
  | { ok: true; content: string }
  | { ok: true; workflows: WorkflowDefinition[] }
  | { ok: true; fields: FieldSnapshot[] }
  | { ok: true; applied: number }
  | { ok: true; messages: ConversationMessage[]; platform: string | null }
  | { ok: true; news: NewsItem[]; degraded: NewsSourceFailure[] }
  | { ok: true; article: NewsArticleText }
  | { ok: true; summary: NewsSummary }
  | { ok: true }
  | { ok: false; error: string };
