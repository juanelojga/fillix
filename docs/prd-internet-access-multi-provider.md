# PRD: Internet Access (ReAct Tool Loop) + Multi-Provider Support

---

## 1. Executive Summary

**Problem Statement**
Fillix is locked to a single LLM backend (local Ollama) and its models have no awareness of real-time information. Users who want to ask about current events, fetch a webpage, or use a hosted model (OpenAI, Anthropic, OpenRouter) must leave the extension entirely.

**Proposed Solution**
Two parallel capabilities: (1) a provider abstraction layer that allows the user to configure any OpenAI-compatible, Anthropic, or Ollama-compatible backend; and (2) a ReAct tool-use loop that gives any configured model access to web search, URL fetching, news headlines, and Wikipedia — all executed in the background service worker and surfaced inline in the chat UI.

**Success Criteria**

- User can switch between Ollama, OpenAI, Anthropic, and any OpenAI-compatible endpoint from the Settings tab with no code changes
- A model using the ReAct loop correctly invokes at least one tool and incorporates the result in ≥ 90% of prompts that require real-time data (evaluated manually with a 20-prompt test set)
- Tool calls are visible inline in the chat UI within 200 ms of invocation
- API keys are never transmitted outside the configured provider endpoint; never logged or stored in plaintext beyond `chrome.storage.local`
- Settings migration from the existing `OllamaConfig` schema is non-destructive (existing users keep their config)

---

## 2. User Experience & Functionality

### User Personas

**Power User / Developer** — runs Ollama locally for privacy-sensitive tasks but wants to switch to GPT-4o or Claude for complex reasoning without losing their chat history or settings.

**Casual User** — wants to ask "what are the top tech headlines today?" and get an answer, without knowing anything about how the model fetches that data.

---

### User Stories & Acceptance Criteria

**Story 1 — Provider Selection**
_As a user, I want to choose which LLM provider powers my chat so that I can balance privacy, cost, and capability per task._

- AC: Settings tab shows a "Provider" dropdown with options: `Ollama`, `OpenAI`, `Anthropic`, `OpenRouter`, `Custom (OpenAI-compatible)`
- AC: Selecting a provider shows only the relevant fields (base URL for Ollama/Custom, API key for hosted providers, model selector for all)
- AC: Model list is fetched dynamically for Ollama (`/api/tags`) and OpenAI-compatible (`/v1/models`); Anthropic and OpenRouter have a curated static list with an "Other" free-text fallback
- AC: Saving settings with an invalid API key or unreachable endpoint shows an inline error — not a silent failure
- AC: Existing Ollama config (`baseUrl`, `model`) migrates automatically; no data loss on extension update

**Story 2 — Tool-Augmented Chat**
_As a user, I want the model to search the web or fetch a URL when I ask about current events, so that I get accurate, up-to-date answers._

- AC: When a model invokes a tool, the chat UI shows an inline indicator (e.g. `Searching: "AI news 2025"…`) before the final answer appears
- AC: The indicator updates for each tool call in a multi-step ReAct chain
- AC: The final answer clearly incorporates the tool result (citations or inline reference)
- AC: If a tool call fails (network error, rate limit), the model receives an error string and may retry or answer without the tool — the user sees a non-blocking warning
- AC: Tool use is bounded to a maximum of **8 iterations** per user message to prevent infinite loops
- AC: Tool calls are available for all providers, not just Ollama

**Story 3 — Tool Transparency**
_As a user, I want to see what the model fetched so I can verify the sources._

- AC: Each tool indicator is expandable (click to reveal) showing the tool name, the query/URL used, and a truncated preview of the raw result (≤ 500 chars)
- AC: Collapsed by default; does not clutter the chat

**Story 4 — Agent Provider Selection**
_As a user, I want to choose which provider and model runs a workflow from the Agent tab, so that I can use a powerful hosted model for complex pipelines without changing my global chat settings._

- AC: The Agent tab shows a provider/model selector (dropdown or compact inline control) above the workflow run button
- AC: The selector is optional — if the user leaves it unset, the workflow runs using the globally configured provider and model from Settings
- AC: When set, the selection is ephemeral — it applies to the current run only and does not persist or overwrite the global Settings
- AC: All configured providers (Ollama, OpenAI, OpenRouter, Custom, etc.) are available in the selector
- AC: If the selected provider is unavailable (e.g. Ollama not running, missing API key), the run button is disabled and an inline error is shown before the user starts the workflow
- AC: The provider/model used for a run is recorded in the Obsidian run log alongside timing and stage output

---

### Non-Goals (This Iteration)

- No per-conversation provider switching in the Chat tab (global setting only for chat)
- No streaming tool results (tool execution is awaited before resuming the stream)
- No custom tool creation by the user (tool set is hardcoded)
- No cost tracking or token counting UI
- No Anthropic tool-use via native API tool-call format (use prompt-based ReAct for all providers for consistency; native API tool-call format is a future enhancement)
- No OAuth or browser-credential-based auth for providers

---

## 3. AI System Requirements

### Tool Definitions

| Tool         | JSON call format                               | Implementation                                           | Input           | Output                                |
| ------------ | ---------------------------------------------- | -------------------------------------------------------- | --------------- | ------------------------------------- |
| `web_search` | `{"tool":"web_search","args":{"query":"..."}}` | SearXNG (self-hosted) or Brave Search API                | `query: string` | Top 5 results: title, URL, snippet    |
| `fetch_url`  | `{"tool":"fetch_url","args":{"url":"..."}}`    | `fetch()` in background, strip HTML tags                 | `url: string`   | First 3000 chars of readable text     |
| `news_feed`  | `{"tool":"news_feed","args":{"topic":"..."}}`  | RSS via configurable feed URL (default: Google News RSS) | `topic: string` | Top 5 headlines with publication date |
| `wikipedia`  | `{"tool":"wikipedia","args":{"title":"..."}}`  | Wikipedia REST API (`/api/rest_v1/page/summary/{title}`) | `title: string` | Article summary (~500 chars) + URL    |

### ReAct Loop Protocol

System prompt injection (appended to the user's configured system prompt):

```
## Tools Available
When you need real-time or external information, emit a tool call on its own line:
{"tool":"<name>","args":{...}}
Stop generating. A result will be appended as a user message. Then continue.
Available tools: web_search, fetch_url, news_feed, wikipedia.
Only call one tool per turn. Never fabricate tool results.
```

Tool result injection format (appended as a `user` role message):

```
[Tool: web_search | Query: "AI news 2025"]
Result:
1. Title — snippet (url)
2. ...
```

### Evaluation Strategy

- **Manual benchmark**: 20 prompts requiring real-time data (10 news, 5 URL fetch, 5 Wikipedia). Pass = model invokes the correct tool and cites the result. Target: ≥ 18/20.
- **Loop termination**: Assert max-iterations guard triggers correctly on a prompt designed to loop indefinitely.
- **Failure path**: Assert model receives error string and produces a graceful fallback answer when tool returns a network error.
- **Provider parity**: Run the same 5 tool-use prompts against Ollama, OpenAI, and OpenRouter. Document per-model pass rates.

---

## 4. Technical Specifications

### Architecture Overview

```
sidepanel/chat.ts
  │  CHAT_START (messages[], systemPrompt, provider, model)
  ▼
background.ts — chat port handler
  │
  ├─ inject tool system prompt
  ├─ resolve provider → LLMProvider interface
  │     ├─ OllamaProvider    (src/lib/providers/ollama.ts)
  │     ├─ OpenAIProvider    (src/lib/providers/openai.ts)  ← also handles OpenRouter, Custom
  │     └─ AnthropicProvider (src/lib/providers/anthropic.ts)
  │
  ├─ chatStream() → stream tokens to sidepanel
  │     └─ on tool-call JSON detected:
  │           ├─ post { type: 'tool-call', toolName, args } → sidepanel shows indicator
  │           ├─ dispatch to ToolRegistry
  │           │     ├─ WebSearchTool  (src/lib/tools/web-search.ts)
  │           │     ├─ FetchUrlTool   (src/lib/tools/fetch-url.ts)
  │           │     ├─ NewsFeedTool   (src/lib/tools/news-feed.ts)
  │           │     └─ WikipediaTool  (src/lib/tools/wikipedia.ts)
  │           ├─ post { type: 'tool-result', toolName, result } → sidepanel updates indicator
  │           └─ append tool messages[] and loop (max 8 iterations)
  │
  └─ on done: post { type: 'done' }
```

### New / Modified Files

| File                             | Change                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/providers/base.ts`      | New — `LLMProvider` interface: `chatStream()`, `listModels()`                                           |
| `src/lib/providers/ollama.ts`    | New — refactor `src/lib/ollama.ts` `chatStream` into this interface                                     |
| `src/lib/providers/openai.ts`    | New — OpenAI-compatible streaming (`/v1/chat/completions` SSE); handles OpenAI, OpenRouter, Custom      |
| `src/lib/providers/anthropic.ts` | New — Anthropic Messages API (`/v1/messages` streaming)                                                 |
| `src/lib/providers/index.ts`     | New — `resolveProvider(config: ProviderConfig): LLMProvider` factory                                    |
| `src/lib/tools/web-search.ts`    | New                                                                                                     |
| `src/lib/tools/fetch-url.ts`     | New                                                                                                     |
| `src/lib/tools/news-feed.ts`     | New                                                                                                     |
| `src/lib/tools/wikipedia.ts`     | New                                                                                                     |
| `src/lib/tools/registry.ts`      | New — `ToolRegistry.dispatch(name, args): Promise<string>`                                              |
| `src/lib/storage.ts`             | Extend — `ProviderConfig` replaces `OllamaConfig`; migration preserves existing values                  |
| `src/types.ts`                   | Extend — add `tool-call` and `tool-result` to `PortMessage`; add `provider` field to `CHAT_START`       |
| `src/background.ts`              | Modify — chat handler gains ReAct loop; resolves provider from config                                   |
| `src/sidepanel/main.ts`          | Modify — Settings tab gains provider dropdown + conditional fields; chat gains tool indicator rendering |
| `manifest.config.ts`             | Modify — add host permissions for each provider and tool endpoint                                       |

### Provider Config Schema

```typescript
type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'custom';

interface ProviderConfig {
  provider: ProviderType;
  baseUrl: string; // always present; default per provider
  model: string;
  apiKey?: string; // required for hosted providers; absent for ollama
}
```

Migration from existing `OllamaConfig`: on load, if storage has `{ baseUrl, model }` without a `provider` key → treat as `ollama`.

### LLMProvider Interface

```typescript
interface LLMProvider {
  chatStream(messages: ChatMessage[], systemPrompt: string, options: StreamOptions): Promise<void>;

  listModels(): Promise<string[]>;
}
```

`StreamOptions` is unchanged from the current `ollama.ts` definition (`signal`, `onToken`, `onThinking`, `onDone`, `onError`).

### Integration Points

| Service         | Auth                                     | Default Base URL                            |
| --------------- | ---------------------------------------- | ------------------------------------------- |
| Ollama          | None                                     | `http://localhost:11434`                    |
| OpenAI          | Bearer API key                           | `<openai-api-base>`                         |
| Anthropic       | `x-api-key` header + `anthropic-version` | `<anthropic-api-base>`                      |
| OpenRouter      | Bearer API key                           | `<openrouter-api-base>` (OpenAI-compatible) |
| Custom          | Optional Bearer                          | User-supplied                               |
| Wikipedia       | None                                     | `https://en.wikipedia.org/api/rest_v1`      |
| Google News RSS | None                                     | `https://news.google.com/rss/search`        |
| Brave Search    | Bearer API key                           | `<brave-search-api-base>` (optional)        |
| SearXNG         | None                                     | Self-hosted; configurable in Settings       |

### Security & Privacy

- API keys stored in `chrome.storage.local` (encrypted at rest by Chrome on supported platforms)
- API keys are never sent to any endpoint other than their configured provider
- `fetch_url` tool: enforced 3000-char truncation, no JS execution, no cookie forwarding — raw `fetch()` only
- Tool results are never persisted to storage or Obsidian unless the user explicitly saves the conversation
- `host_permissions` in manifest is the enforcement boundary; adding a new provider requires a manifest change and extension reload (by design)

---

## 5. Risks & Roadmap

### Phased Rollout

**MVP (this iteration)**

- Provider abstraction layer: Ollama + OpenAI-compatible (covers OpenAI, OpenRouter, Qwen via Dashscope, LM Studio, Groq, Custom)
- ReAct loop with all 4 tools
- Inline tool indicators in chat
- Settings tab: provider dropdown, API key input, dynamic model list

**v1.1**

- Native Anthropic provider (Messages API streaming)
- Brave Search API as configurable alternative to SearXNG/Google News RSS
- Tool call collapse/expand UI with full result preview
- Per-provider curated model list with free-text override

**v2.0**

- Native API tool-call format for providers that support it (OpenAI function-calling, Anthropic tool-use) — more reliable than prompt-based ReAct
- User-configurable tool enable/disable per conversation
- Tool result caching (TTL-based, keyed by query hash) to reduce redundant fetches

### Technical Risks

| Risk                                                   | Likelihood                           | Mitigation                                                                         |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Small models ignore the tool-call JSON format          | High for < 7B models                 | Document minimum recommended model sizes; graceful fallback (answer without tools) |
| `fetch_url` blocked by CSP or auth-walled pages        | Medium                               | Return a structured error string; model answers from prior knowledge               |
| OpenRouter / OpenAI API key accessible to extension JS | Low — expected for a local extension | Document clearly; recommend users use separate low-privilege API keys              |
| Infinite ReAct loops on adversarial prompts            | Low                                  | Hard cap at 8 iterations; unconditional enforcement                                |
| Google News RSS structure changes                      | Low                                  | Narrow XML parser; SearXNG is the fallback                                         |
| Anthropic streaming SSE format differs from OpenAI     | Known                                | Separate `AnthropicProvider` implementation; not mixed with OpenAI adapter         |
