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
      model?: string;
    }
  | { type: 'CHAT_STOP' }
  // News tab (sidepanel → bg, one-shot request/response)
  | { type: 'NEWS_REFRESH' }
  | { type: 'NEWS_ARTICLE'; item: NewsItem }
  | { type: 'NEWS_SUMMARIZE'; title: string; source: string; text: string };

// Success arms are distinguished ONLY by payload key shape (narrowed with `'key' in r`).
// Never reuse an existing key name with a different value type: it cross-wires silently
// with no compiler diagnostic. Taken: value, latencyMs, news, degraded, article, summary.
export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; latencyMs: number }
  | { ok: true; news: NewsItem[]; degraded: NewsSourceFailure[] }
  | { ok: true; article: NewsArticleText }
  | { ok: true; summary: NewsSummary }
  | { ok: false; error: string };
