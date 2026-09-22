import type { AnswerDraft } from './lib/answers/draft-answer';
import type { TavilyKeyStatus } from './lib/tavily/search';
import type { QuestionTimes } from './lib/answers/question-times';
import type { TopicSuggestion } from './lib/linkedin/suggest-topics';
import type { TopicResearch } from './lib/linkedin/topic-research';
import type { AngleBrief, HookVariant } from './lib/linkedin/write-brief';
import type { PostResult } from './lib/linkedin/write-post';
import type { PostSpecifics } from './lib/linkedin/post-specifics';

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
  // `model` is resolved by the sidepanel, which needs the same value for the
  // "Summarizing with X" label. Omitted ⇒ the worker uses the active model.
  | { type: 'NEWS_SUMMARIZE'; title: string; source: string; text: string; model?: string }
  // Profile tab (sidepanel → bg). Embedding is an outbound request, so it belongs to the
  // worker; the vectors then live in storage and the panel scores them locally, because
  // shipping ~275 KB of floats back through sendMessage on every question would be absurd.
  | { type: 'PROFILE_INDEX' }
  // Only the query crosses the port. The vectors stay in storage and the panel scores them.
  | { type: 'PROFILE_QUERY'; query: string }
  | { type: 'TEST_EMBED_MODEL'; model: string }
  // Verifying the Tavily API key, from the Settings tab's Test button. Carries no payload on
  // purpose: the worker reads the key from storage, so the one credential in the product never
  // crosses sendMessage. The `tavily_search` tool itself needs no message at all — chat tools
  // already run in the worker and read storage directly.
  | { type: 'TEST_TAVILY' }
  // The panel retrieves (it holds the vectors) and sends the evidence; the worker owns the
  // outbound generate call, as it does for NEWS_SUMMARIZE.
  // Reading the times out of one question. Separate from DRAFT_ANSWER because the panel has to
  // *compute* against the result — convert the zones, intersect with the stored hours — before
  // it knows what evidence to send, and that computation is pure and belongs on the panel side.
  | { type: 'EXTRACT_QUESTION_TIMES'; question: string; model?: string }
  | {
      type: 'DRAFT_ANSWER';
      kind: 'question' | 'pitch';
      question: string;
      job: string;
      evidence: string;
      /** Who a 'pitch' is written about. Resolved in the panel, which holds the profile. */
      applicantName?: string;
      model?: string;
    }
  // Stage 1 of the LinkedIn composer. The voice spec is NOT carried: the worker reads it from
  // storage, as `chat-runner.ts` does with the system prompt, so a multi-kilobyte document
  // never crosses `sendMessage` on every press.
  | { type: 'POST_TOPICS'; seed: string; model?: string }
  // Stage 2, in two messages rather than one, for the reason NEWS_ARTICLE and NEWS_SUMMARIZE
  // are two: the failure stage is then intrinsic rather than guessed, and "Tavily is out of
  // credits" and "the model returned invalid JSON" need different next steps.
  //
  // No key: the worker reads `tavilyConfig` from storage, as TEST_TAVILY does, so the one
  // credential in the product never crosses sendMessage.
  | { type: 'POST_RESEARCH'; topic: string }
  // `pillar` is a string, not a PillarId: it came back from POST_TOPICS and may be what an
  // older build produced, so `write-brief.ts` re-validates it. Same reasoning as
  // `resolvePlaybook(id: string)`.
  | {
      type: 'POST_BRIEF';
      topic: string;
      angle: string;
      pillar: string;
      evidence: string;
      model?: string;
    }
  // Stage 3. The specifics ride back in rather than being retrieved again: they were embedded
  // once during POST_BRIEF, and a second embedding call could rank differently and ground the
  // post in sections the angle was never built on.
  | {
      type: 'POST_WRITE';
      brief: AngleBrief;
      hook: HookVariant;
      evidence: string;
      specifics: string;
      model?: string;
    };

// Success arms are distinguished ONLY by payload key shape (narrowed with `'key' in r`).
// Never reuse an existing key name with a different value type: it cross-wires silently
// with no compiler diagnostic. Taken: value, latencyMs, news, degraded, article, summary,
// indexed, queryVector, draft, times, tavily, topics, research, brief, specifics, post.
export type MessageResponse =
  | { ok: true; value: string }
  | { ok: true; latencyMs: number }
  | { ok: true; news: NewsItem[]; degraded: NewsSourceFailure[] }
  | { ok: true; article: NewsArticleText }
  | { ok: true; summary: NewsSummary }
  // The index itself stays in storage; only its shape comes back, for the status line.
  | { ok: true; indexed: { chunks: number; dim: number; builtAt: number } }
  | { ok: true; queryVector: number[] }
  | { ok: true; draft: AnswerDraft }
  // Only what the question said, never what it means: the verdict is computed in the panel.
  | { ok: true; times: QuestionTimes }
  // Its own arm rather than the shared `latencyMs` one: the probe is GET /usage, so it returns
  // how much of the key's allowance is left as well as the round trip, and the model is what
  // spends that allowance. A second `{ latencyMs }` arm could not be narrowed from the first.
  | { ok: true; tavily: TavilyKeyStatus }
  // `topics`, not `draft`: that key already carries an AnswerDraft, and reusing a key name
  // with a different value type cross-wires the two arms with no compiler diagnostic.
  | { ok: true; topics: TopicSuggestion[] }
  // Degradation rides inside TopicResearch rather than reusing the news arm's `degraded`:
  // that key already carries NewsSourceFailure[], and two arms sharing a key name with
  // different value types cross-wire with no compiler diagnostic.
  | { ok: true; research: TopicResearch }
  // Two keys, narrowed on `'brief' in r`, as the news arm narrows on `'news' in r`. The
  // specifics ride along so POST_WRITE can reuse them without a second embedding call.
  | { ok: true; brief: AngleBrief; specifics: PostSpecifics }
  // `post`, not `draft`: that key already carries an AnswerDraft, and two arms sharing a
  // key name with different value types cross-wire with no compiler diagnostic.
  | { ok: true; post: PostResult }
  | { ok: false; error: string };
