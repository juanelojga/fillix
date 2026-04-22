# Plan: Internet Access (ReAct Tool Loop) + Multi-Provider Support

**Generated**: 2026-04-21
**Estimated Complexity**: High

---

## Context

Fillix is locked to Ollama for chat. Users who want hosted models (OpenAI, OpenRouter, Groq, LM Studio) or real-time web knowledge must leave the extension. This sprint delivers:

1. **Provider abstraction layer** — Chat tab can use any OpenAI-compatible endpoint or Ollama, configurable via Settings.
2. **ReAct tool loop** — Background worker detects tool-call JSON in streamed output, executes 4 tools (web search, URL fetch, news feed, Wikipedia), injects results, and loops (max 8 iterations).

**Scope decisions:**

- Anthropic provider deferred to v1.1 (Ollama + OpenAI-compatible only)
- Brave Search API as the `web_search` backend (user enters free API key in Settings)
- Agent tab provider selection deferred (workflow frontmatter will carry it later)
- Form-fill (`OLLAMA_INFER`) and pipeline stages remain Ollama-only per CLAUDE.md privacy policy

---

## Prerequisites

- Node / pnpm installed
- `pnpm install` passes
- Brave Search API key (free tier) available for manual testing

---

## Sprint 1: Storage + Type Foundation

**Goal**: New `ProviderConfig` type replaces `OllamaConfig` for chat; storage migration preserves existing users; types updated for tool messages.

**Demo/Validation**:

- Existing `ollama` key in storage loads correctly as `{ provider: 'ollama', baseUrl: '...', model: '...' }`
- `LIST_MODELS` message dispatches and returns models
- `tool-call` / `tool-result` PortMessage variants compile without TS errors

### Task 1.1: Add ProviderConfig types to `src/types.ts`

- **Location**: `src/types.ts`
- **Description**:
  - Add `ProviderType = 'ollama' | 'openai' | 'openrouter' | 'custom'`
  - Add `ProviderConfig { provider: ProviderType; baseUrl: string; model: string; apiKey?: string }`
  - Add `SearchConfig { braveApiKey?: string; searxngUrl?: string }`
  - Add `LIST_MODELS` to `Message` union (alongside existing `OLLAMA_LIST_MODELS` — keep old variant for backward compat)
  - Add `tool-call` and `tool-result` variants to `PortMessage`:
    - `{ type: 'tool-call'; toolName: string; args: Record<string, string> }`
    - `{ type: 'tool-result'; toolName: string; result: string }`
  - Add `provider?: ProviderType` to `CHAT_START` message (optional; background falls back to stored config)
  - Keep `OllamaConfig` and `OLLAMA_LIST_MODELS` in place (used by form-fill and pipeline; not removed)
- **Acceptance Criteria**:
  - `pnpm typecheck` passes
  - `MessageResponse { ok: true; models: string[] }` already exists — verify it covers `LIST_MODELS`

### Task 1.2: Extend `src/lib/storage.ts` with ProviderConfig + SearchConfig

- **Location**: `src/lib/storage.ts`
- **Description**:
  - Add `DEFAULT_PROVIDER: ProviderConfig = { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' }`
  - Add `getProviderConfig(): Promise<ProviderConfig>` — reads `provider` key from `chrome.storage.local`; **migration**: if `provider` key absent but `ollama` key present, returns `{ provider: 'ollama', ...ollamaValues }`
  - Add `setProviderConfig(c: ProviderConfig): Promise<void>` — writes `provider` key
  - Add `getSearchConfig(): Promise<SearchConfig>` — reads `search` key, defaults `{}`
  - Add `setSearchConfig(c: SearchConfig): Promise<void>`
  - Do NOT remove existing `getOllamaConfig` / `setOllamaConfig` (pipeline and form-fill still use them)
- **Acceptance Criteria**:
  - Loading on a profile with existing `ollama` key returns correct migrated ProviderConfig
  - Loading on a fresh profile returns DEFAULT_PROVIDER
  - `pnpm typecheck` passes

---

## Sprint 2: LLMProvider Interface + Implementations

**Goal**: Background can resolve any configured provider to a common `LLMProvider` interface; OllamaProvider and OpenAIProvider both pass a manual chat smoke-test.

**Demo/Validation**:

- Switch provider to OpenAI-compatible (e.g. Ollama's `/v1/chat/completions` endpoint), send a chat message → tokens stream in sidepanel
- Model list populates for both providers
- `pnpm typecheck` passes

### Task 2.1: Define LLMProvider interface — `src/lib/providers/base.ts`

- **Location**: `src/lib/providers/base.ts` (new file)
- **Description**:

  ```typescript
  export type StreamOptions = {
    signal: AbortSignal;
    onToken: (token: string) => void;
    onThinking?: (token: string) => void;
    onDone: () => void;
    onError: (err: string) => void;
  };

  export interface LLMProvider {
    chatStream(
      messages: ChatMessage[],
      systemPrompt: string,
      options: StreamOptions,
    ): Promise<void>;
    listModels(): Promise<string[]>;
  }
  ```

- **Acceptance Criteria**: Interface compiles; `StreamOptions` mirrors existing definition in `src/lib/ollama.ts`

### Task 2.2: OllamaProvider — `src/lib/providers/ollama.ts`

- **Location**: `src/lib/providers/ollama.ts` (new file)
- **Description**: Wraps existing `chatStream` and `listModels` from `src/lib/ollama.ts` into the `LLMProvider` interface. Delegates to the existing functions — no logic duplication.
- **Note**: `src/lib/ollama.ts` is NOT modified; it stays as-is for pipeline and form-fill use.
- **Acceptance Criteria**: `new OllamaProvider(config).chatStream(...)` streams tokens identically to current behavior

### Task 2.3: OpenAIProvider — `src/lib/providers/openai.ts`

- **Location**: `src/lib/providers/openai.ts` (new file)
- **Description**:
  - `chatStream`: POST `<baseUrl>/v1/chat/completions` with `{ model, messages, stream: true }`; `Authorization: Bearer <apiKey>`; parse SSE lines (`data: {...}`); extract `choices[0].delta.content`; done sentinel: `data: [DONE]`
  - `listModels`: GET `<baseUrl>/v1/models`; `Authorization: Bearer <apiKey>`; return `data[].id` sorted
  - `baseUrl` override covers OpenRouter, Groq, LM Studio, Custom (all OpenAI-compatible)
  - For OpenRouter: add `HTTP-Referer` (`chrome-extension://<id>` via `chrome.runtime.id`) and `X-Title: Fillix` headers
  - Non-2xx response → read body, call `onError`
- **Acceptance Criteria**:
  - Streams tokens from any OpenAI-compatible endpoint
  - `listModels()` returns model IDs from `/v1/models`

### Task 2.4: Provider factory — `src/lib/providers/index.ts`

- **Location**: `src/lib/providers/index.ts` (new file)
- **Description**:
  ```typescript
  export function resolveProvider(config: ProviderConfig): LLMProvider {
    switch (config.provider) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openai':
      case 'openrouter':
      case 'custom':
        return new OpenAIProvider(config);
    }
  }
  ```
- **Acceptance Criteria**: TypeScript exhaustiveness check covers all `ProviderType` variants

---

## Sprint 3: Tool Implementations + ToolRegistry

**Goal**: All 4 tools callable from background; ToolRegistry dispatches by name and returns a plain string result.

**Demo/Validation**:

- Manually invoke each tool from a background script console and verify output format matches PRD spec
- `wikipedia` tool returns ~500-char summary + URL
- `web_search` (Brave) returns 5 results with title, URL, snippet

### Task 3.1: WikipediaTool — `src/lib/tools/wikipedia.ts`

- **Location**: `src/lib/tools/wikipedia.ts` (new file)
- **Description**: GET `<wikipedia-rest-v1-base>/page/summary/{encodeURIComponent(title)}`; return `extract` truncated to 500 chars + `content_urls.desktop.page`. On error: return `Error: <message>` string (never throw).

### Task 3.2: FetchUrlTool — `src/lib/tools/fetch-url.ts`

- **Location**: `src/lib/tools/fetch-url.ts` (new file)
- **Description**: `fetch(url, { credentials: 'omit' })`; strip HTML tags via regex; return first 3000 chars. Enforce: URL must start with `http://` or `https://`. On error: return `Error: <message>` string.

### Task 3.3: NewsFeedTool — `src/lib/tools/news-feed.ts`

- **Location**: `src/lib/tools/news-feed.ts` (new file)
- **Description**: Fetch `<google-news-rss-base>?q={encodeURIComponent(topic)}`; parse XML `<item>` nodes via `DOMParser` (available in MV3 service workers since Chrome 109); return top 5 as `1. Title — pubDate (link)\n...`. On error: return `Error: <message>` string.

### Task 3.4: WebSearchTool — `src/lib/tools/web-search.ts`

- **Location**: `src/lib/tools/web-search.ts` (new file)
- **Description**: GET `<brave-search-api-base>/res/v1/web/search?q={query}&count=5`; headers `Accept: application/json`, `X-Subscription-Token: <braveApiKey>`; parse `web.results[].{title, url, description}`; return as numbered list. If `braveApiKey` is empty → return `Error: Brave Search API key not configured`. On error: return `Error: <message>` string.

### Task 3.5: ToolRegistry — `src/lib/tools/registry.ts`

- **Location**: `src/lib/tools/registry.ts` (new file)
- **Description**:
  ```typescript
  export async function dispatchTool(
    name: string,
    args: Record<string, string>,
    searchConfig: SearchConfig,
  ): Promise<string>;
  ```
  Routes to the correct tool by name; passes `searchConfig.braveApiKey` to `WebSearchTool`. Unknown tool name → `Error: unknown tool "${name}"`.

---

## Sprint 4: ReAct Loop in background.ts

**Goal**: Chat port handler uses `resolveProvider()` and runs the ReAct tool loop; tool indicators are posted to the sidepanel port.

**Demo/Validation**:

- Ask "what are the top AI headlines today?" → sidepanel shows tool indicator, then a final answer
- Ask a prompt designed to loop → terminates at 8 iterations
- `sanitizeError` redacts provider API key from error messages

### Task 4.1: Refactor chat port handler in `src/background.ts`

- **Location**: `src/background.ts`, `port.name === 'chat'` block (lines ~384–411)
- **Description**:
  1. Replace `getOllamaConfig()` → `getProviderConfig()`
  2. Replace direct `chatStream` call → `resolveProvider(config).chatStream(...)`
  3. Inject tool system prompt by prepending to `msg.systemPrompt`:
     ```
     ## Tools Available
     When you need real-time or external information, emit a tool call on its own line:
     {"tool":"<name>","args":{...}}
     Stop generating. A result will be appended as a user message. Then continue.
     Available tools: web_search, fetch_url, news_feed, wikipedia.
     Only call one tool per turn. Never fabricate tool results.
     ```
  4. Wrap `chatStream` in a ReAct loop (max 8 iterations):
     - Buffer streamed tokens; detect a complete JSON line matching `{"tool":"...","args":{...}}`
     - On detection: post `{ type: 'tool-call', toolName, args }` to port; abort stream; call `dispatchTool()`; post `{ type: 'tool-result', toolName, result }` to port; append tool messages; start next iteration
     - No tool call detected in a pass → stream completes normally → `onDone`
     - After 8 iterations without final answer → unconditional `onDone`
  5. Update `sanitizeError` call to also redact `config.apiKey`
- **Dependencies**: Tasks 2.4, 3.5

### Task 4.2: Add `LIST_MODELS` case to `handle()` in `src/background.ts`

- **Location**: `src/background.ts` `handle()` function (~line 463)
- **Description**: Add `LIST_MODELS` case alongside existing `OLLAMA_LIST_MODELS`; calls `resolveProvider(await getProviderConfig()).listModels()`; returns `{ ok: true, models }`.

---

## Sprint 5: Settings UI

**Goal**: Settings tab has a Provider dropdown; shows relevant fields per provider; model list refreshes from the active provider; Brave API key is configurable.

**Demo/Validation**:

- Select "OpenAI" → API key field appears, base URL row hides
- Select "Custom" → both API key and base URL appear
- "Refresh models" with a valid key → model list populates
- Save with invalid key → inline error shown
- Reload Settings → selections persist

### Task 5.1: Add provider section HTML to `src/sidepanel/index.html`

- **Location**: `src/sidepanel/index.html`, inside `#settings-view`
- **Description**: Add before existing Ollama URL / model inputs:
  - `<select id="provider-select">` with options: `ollama`, `openai`, `openrouter`, `custom`
  - `<div id="provider-baseurl-row">` wrapping the existing base URL input (hidden for `openai`/`openrouter`)
  - `<div id="provider-apikey-row">` with `<input id="provider-apikey" type="password">` (shown for non-ollama)
  - `<div id="search-apikey-row">` with `<input id="brave-apikey" type="password" placeholder="Brave Search API key (optional)">`
  - Labels and layout consistent with existing Settings style (plain DOM, no CSS framework)

### Task 5.2: Update `src/sidepanel/settings.ts` for provider-aware load/save

- **Location**: `src/sidepanel/settings.ts`
- **Description**:
  - `loadSettings()`: call `getProviderConfig()` + `getSearchConfig()`; populate all new fields; call `updateProviderFieldVisibility()`
  - `saveSettings()`: read all fields; call `setProviderConfig()` + `setSearchConfig()`; also call `setOllamaConfig({ baseUrl, model })` **only when provider is `ollama`** (pipeline reads `getOllamaConfig()`)
  - `updateProviderFieldVisibility(provider)`: show/hide `#provider-baseurl-row` and `#provider-apikey-row` based on selected provider
  - `refreshModels()`: send `LIST_MODELS` message; populate model dropdown; show inline error on failure
  - Wire `#provider-select` `change` event → `updateProviderFieldVisibility()` + `refreshModels()`

---

## Sprint 6: Chat UI Tool Indicators

**Goal**: `tool-call` and `tool-result` port messages render as inline collapsible indicators in the chat.

**Demo/Validation**:

- During tool call: grey indicator `[tool-name] query…` appears between messages
- After result: indicator updates; click to expand shows ≤ 500-char raw result
- Multiple sequential tool calls each get their own indicator

### Task 6.1: Handle tool port messages in `src/sidepanel/chat.ts`

- **Location**: `src/sidepanel/chat.ts`
- **Description**:
  - On `{ type: 'tool-call', toolName, args }`: call `appendToolIndicator(toolName, args)` → insert `<div class="tool-indicator loading">` with tool name and primary arg
  - On `{ type: 'tool-result', toolName, result }`: find active indicator, update class to `done`, store result in `data-result` attribute
  - Click on indicator → toggle expand showing `data-result` truncated to 500 chars
  - Plain DOM manipulation only; no new dependencies

### Task 6.2: Style tool indicators in `src/sidepanel/index.html`

- **Location**: `src/sidepanel/index.html` inline `<style>` block
- **Description**: Add minimal CSS for `.tool-indicator` — background, border-left accent, monospace font for tool name, pointer cursor. Use existing CSS variable palette.

---

## Sprint 7: Manifest + Host Permissions

**Goal**: All new external endpoints listed in `host_permissions` so background worker fetch calls succeed.

**Demo/Validation**:

- `web_search` and Wikipedia tool calls succeed from background
- Extension loads without manifest validation errors

### Task 7.1: Update `manifest.config.ts`

- **Location**: `manifest.config.ts`
- **Description**: Extend `host_permissions` with each new endpoint (use actual URLs at implementation time):
  - `<openai-api-base>/*`
  - `<openrouter-api-base>/*`
  - `<brave-search-api-base>/*`
  - `<wikipedia-rest-base>/*`
  - `<google-news-rss-base>/*`
  - Keep existing `http://localhost:11434/*`, `http://localhost:27123/*`, `<all_urls>`

---

## Critical Files

| File                          | Action                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `src/types.ts`                | Extend — ProviderConfig, SearchConfig, LIST_MODELS, tool-call/tool-result PortMessage      |
| `src/lib/storage.ts`          | Extend — getProviderConfig, setProviderConfig, getSearchConfig, setSearchConfig, migration |
| `src/lib/ollama.ts`           | **No changes** — kept as-is for form-fill and pipeline                                     |
| `src/background.ts`           | Modify — chat port uses resolveProvider + ReAct loop; handle() gains LIST_MODELS           |
| `src/sidepanel/settings.ts`   | Modify — provider dropdown, conditional fields, model refresh                              |
| `src/sidepanel/index.html`    | Modify — provider HTML fields, tool indicator styles                                       |
| `src/sidepanel/chat.ts`       | Modify — render tool-call/tool-result port messages                                        |
| `manifest.config.ts`          | Modify — host_permissions additions                                                        |
| `src/lib/providers/base.ts`   | New — LLMProvider interface, StreamOptions                                                 |
| `src/lib/providers/ollama.ts` | New — OllamaProvider wrapper                                                               |
| `src/lib/providers/openai.ts` | New — OpenAIProvider (handles openai/openrouter/custom)                                    |
| `src/lib/providers/index.ts`  | New — resolveProvider() factory                                                            |
| `src/lib/tools/web-search.ts` | New — Brave Search                                                                         |
| `src/lib/tools/fetch-url.ts`  | New — URL fetch + HTML strip                                                               |
| `src/lib/tools/news-feed.ts`  | New — Google News RSS                                                                      |
| `src/lib/tools/wikipedia.ts`  | New — Wikipedia REST                                                                       |
| `src/lib/tools/registry.ts`   | New — dispatchTool()                                                                       |

---

## Testing Strategy

| Area                   | Method                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Provider abstraction   | Manual: switch Settings to OpenAI-compatible URL, verify chat streams                       |
| OllamaProvider parity  | Verify existing chat behavior unchanged after refactor                                      |
| Tool outputs           | Manual: send prompts requiring each tool; verify inline indicator + final answer            |
| ReAct loop termination | Send looping prompt; assert terminates at 8 iterations                                      |
| Tool failure path      | Provide invalid Brave API key; verify warning shown and model still answers                 |
| Storage migration      | Load with existing `ollama` key; open Settings; verify Ollama selected and fields populated |
| Settings persistence   | Change provider, save, reload, reopen Settings; verify selection persists                   |
| Typecheck              | `pnpm typecheck` must pass after every sprint                                               |

---

## Potential Risks & Gotchas

- **Tool JSON detection in stream**: Buffer tokens until `\n`; only attempt `JSON.parse` on lines starting with `{`. If model emits partial JSON mid-line, parse fails silently and loop exits gracefully.
- **Ollama `/v1/` vs `/api/chat`**: OllamaProvider always targets `/api/chat`. Users who want OpenAI-compat Ollama should pick `custom`.
- **`sanitizeError` must redact provider API key**: Currently only redacts the Obsidian key. After Task 4.1, also redact `config.apiKey`.
- **`setOllamaConfig` on save**: Write the `ollama` key only when provider is `ollama`; otherwise leave it at its last-saved Ollama values so the pipeline is unaffected.
- **`DOMParser` in service worker**: Available in MV3 service workers since Chrome 109. Verify against project's minimum Chrome version.
- **OpenRouter `HTTP-Referer` header**: Use `chrome.runtime.id` at runtime to build the referer dynamically — do not hardcode the extension ID.

## Rollback Plan

All new files are additions; no existing files are deleted. `src/lib/ollama.ts`, `getOllamaConfig`, and `setOllamaConfig` remain untouched — form-fill and pipeline continue to work even if the provider layer is broken. To revert: remove Sprints 2–7 new files, restore the chat port handler in `background.ts` to call `chatStream` directly from `src/lib/ollama.ts`.
