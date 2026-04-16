# PRD: Fillix Side-Panel Chat

## Context

Fillix is pivoting. What shipped initially was a form auto-filler (content script + popup + Ollama `/api/generate`). Going forward, the **side-panel chat** is the headline feature: a browser-native chat experience powered entirely by a local Ollama model, with no cloud round-trips. The existing form-fill code remains in the tree for MVP but is no longer the primary surface — its fate is deferred to a post-launch decision. This PRD defines the MVP of the chat experience and the configuration UI that supports it.

---

## 1. Executive Summary

- **Problem Statement**: Users who want to chat with a local LLM must either juggle a separate desktop app or paste content between tabs. There is no lightweight, always-available chat surface that lives alongside the browsing experience and keeps every token on-device.
- **Proposed Solution**: A Manifest V3 Chrome extension that opens a Chrome Side Panel containing a minimal chat UI, streaming responses from a user-run Ollama instance. A configuration tab lets the user pick base URL, model, and system prompt. Conversations are ephemeral by design — closing the panel or pressing "New conversation" wipes them.
- **Success Criteria**:
  1. **Time-to-first-token ≤ 1.5s** on `llama3.2` over loopback, measured from send-click to first streamed token in the UI.
  2. **Zero network egress** to non-`localhost` hosts during chat (verified via `chrome://net-export` capture on a 5-message session).
  3. **Stop button aborts ≤ 300ms** after click, verified by Ollama server logs showing a cancelled request.
  4. **Config round-trip works** — user can change base URL/model/system prompt, close and reopen the side panel, and next message uses the new config without a reload.
  5. **Markdown renders** code blocks, lists, bold, and inline code for the 10 canonical test prompts in §3 without layout breaks.

---

## 2. User Experience & Functionality

### User Personas

- **Primary — "Privacy-conscious developer"**: Already runs Ollama locally, wants a browser chat that never calls a cloud API. Comfortable editing a system prompt.
- **Secondary — "LLM tinkerer"**: Swaps between local models (`llama3.2`, `qwen2.5`, `mistral`) and wants a low-friction UI to test prompts without opening a terminal.

### User Stories & Acceptance Criteria

**Story 1 — Open the chat**

- _As a user, I want to open the chat from the browser toolbar so I can ask the local model a question without leaving my current tab._
- **AC:**
  - Clicking the Fillix toolbar icon opens the Chrome Side Panel on the right.
  - Panel persists as the user switches tabs (Chrome default behavior for `sidePanel`).
  - If Ollama is unreachable on first send, the UI shows an inline error with the base URL it tried, not a generic failure.

**Story 2 — Send a message and see a streamed response**

- _As a user, I want to see tokens appear as the model generates them so I know it's working and can read as it goes._
- **AC:**
  - Input is a multi-line textarea. Enter sends; Shift+Enter inserts a newline.
  - Send button is disabled while a response is streaming.
  - Assistant tokens append to the message bubble as they arrive.
  - When streaming ends, message is re-rendered with full markdown (code blocks, lists, bold, inline code).

**Story 3 — Stop a response mid-stream**

- _As a user, I want to interrupt a bad answer without waiting for it to finish._
- **AC:**
  - While streaming, the send button becomes a stop button.
  - Clicking stop aborts the fetch to Ollama within 300ms; the partial message is preserved in the conversation.
  - Stop does not clear the conversation.

**Story 4 — Start a fresh conversation**

- _As a user, I want a one-click way to wipe the chat and start over._
- **AC:**
  - A "New conversation" button is visible in the side panel header.
  - Clicking it clears all messages from the UI and in-memory history.
  - No persistence — refreshing the side panel also loses the conversation (intentional; see Non-Goals).

**Story 5 — Configure Ollama connection**

- _As a user, I want to set my base URL, pick from installed models, and customize the system prompt._
- **AC:**
  - A "Settings" tab (or gear icon) in the side panel switches to a config view.
  - Fields: **Base URL** (text), **Model** (dropdown populated from `/api/tags`), **System Prompt** (textarea).
  - "Save" persists to `chrome.storage.local`; "Refresh models" re-queries `/api/tags`.
  - Config changes take effect on the next message without reloading the extension.

### Non-Goals (MVP)

- **No conversation persistence.** Chat is in-memory only. No history, no export, no search across past chats.
- **No page awareness.** The chat does not read the current tab, inject selected text, or screenshot pages. Purely a standalone LLM chat. (Revisit in v1.1 if user demand appears.)
- **No multi-conversation tabs.** One conversation at a time.
- **No non-Ollama providers.** OpenAI-compatible endpoints, LM Studio, etc. are out of scope.
- **No attachments / images / tool use.** Text in, text out.
- **Form auto-fill is untouched, not promoted.** Existing content script and popup remain; they are not referenced from the side panel. Decision on keeping/removing them is deferred.

---

## 3. AI System Requirements

### Tool / API Requirements

- **Ollama `/api/chat`** with `stream: true` — new capability; current `ollama.ts` only uses `/api/generate` non-streaming.
- **Ollama `/api/tags`** — already supported in `ollama.ts` via `listModels()`; reuse as-is.

### Prompt Contract

- **System prompt**: user-configurable; default is a short neutral prompt (e.g. `"You are a helpful assistant running locally via Ollama. Keep answers concise unless asked for detail."`).
- **Message format**: standard `{ role: 'system' | 'user' | 'assistant', content: string }[]`, sent verbatim to `/api/chat`. No tool calls, no `format: 'json'` (unlike the form-fill path).
- **No hallucination guardrails needed at this layer** — the model speaks directly to the user; there's no downstream parser that would be corrupted by malformed output.

### Evaluation Strategy

- **Smoke test set — 10 canonical prompts** covering:
  1. Short factual ("What year is it?")
  2. Code block ("Write a Python FizzBuzz.")
  3. Multi-paragraph markdown ("Explain async/await in 3 paragraphs.")
  4. Ordered list ("List 5 steps to deploy a Node app.")
  5. Unordered list w/ nested ("List frontend frameworks and their strengths.")
  6. Inline code ("What does `Array.prototype.flat()` do?")
  7. Long response (>500 tokens) — validates streaming doesn't stall.
  8. Mid-stream stop — send a long prompt, click stop at ~1s, verify partial preserved.
  9. Empty input — verify send is no-op / disabled.
  10. Back-to-back sends — verify turn ordering and no race.
- **Pass bar**: 10/10 render correctly, streaming visible, no UI locks. Run manually before each release; automate if a test runner is added later.
- **Performance budget**: time-to-first-token < 1.5s on `llama3.2` on a modern dev machine (M-series Mac or equivalent). Regressions >50% block release.

---

## 4. Technical Specifications

### Architecture Overview

```
┌─────────────────────┐     long-lived port      ┌─────────────────────┐      HTTP stream     ┌──────────────┐
│   Side Panel UI     │ ◀──────────────────────▶ │  Background Worker  │ ◀──────────────────▶ │   Ollama     │
│  src/sidepanel/     │    chrome.runtime        │   src/background.ts │   /api/chat stream   │  localhost   │
│  (vanilla DOM)      │    .connect()            │   (service worker)  │   /api/tags          │   :11434     │
└─────────────────────┘                          └─────────────────────┘                      └──────────────┘
```

**Why a port instead of `sendMessage`:** `sendMessage` is request/response only. Streaming tokens from Ollama → background → UI requires a long-lived channel. `chrome.runtime.connect({ name: 'chat' })` gives a `Port` that the background can `postMessage` chunks onto as they arrive.

**Why the background still owns Ollama calls:** Same reason as form-fill (see CLAUDE.md). The side panel runs in an extension context with a `chrome-extension://` origin, so it _could_ call Ollama directly — but keeping the HTTP boundary in the background keeps a single chokepoint for error handling, abort control, and the eventual addition of request logging / rate limiting.

### File-Level Changes

**New files:**

- `src/sidepanel/index.html` — shell (chat view + settings view, toggled by a tab bar).
- `src/sidepanel/main.ts` — vanilla DOM, following `src/popup/main.ts` pattern.
- `src/sidepanel/chat.ts` — chat state machine (messages array, streaming state, port connection).
- `src/sidepanel/markdown.ts` — thin wrapper around `marked` (see Dependencies).

**Modified files:**

- `manifest.config.ts` — add `"side_panel": { "default_path": "src/sidepanel/index.html" }` and `"sidePanel"` to permissions. Keep `action` popup for now (form-fill deferred), but consider making toolbar click open the side panel via `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` in `background.ts`.
- `src/lib/ollama.ts` — add `chatStream(config, messages, { signal, onToken, onDone, onError })`. Uses `fetch` with `stream: true`, reads `response.body.getReader()`, parses newline-delimited JSON, emits tokens. Existing `listModels` and `inferFieldValue` untouched.
- `src/lib/storage.ts` — add `getChatConfig()` / `setChatConfig()` for a new `'chat'` key: `{ systemPrompt: string }`. Base URL and model continue to live under the existing `'ollama'` key (shared with form-fill to avoid duplication).
- `src/types.ts` — extend `Message` union with `CHAT_START` (payload: `{ messages, systemPrompt }`) and `CHAT_STOP` (no payload). Port-based streaming uses its own message shape (`{ type: 'token', value }` / `{ type: 'done' }` / `{ type: 'error', error }`) sent over the port — document this inline.
- `src/background.ts` — add `chrome.runtime.onConnect` listener for `name === 'chat'`. On `CHAT_START`, spawn `chatStream` with an `AbortController`; pipe tokens to the port. On `CHAT_STOP` or port disconnect, abort. Keep existing `onMessage` handlers (`OLLAMA_INFER`, `OLLAMA_LIST_MODELS`) intact.

### Integration Points

- **Ollama `/api/chat`** — new endpoint for this project. NDJSON stream; each line is a JSON object with `message.content` (token) and `done` (bool).
- **Chrome Side Panel API** — requires Manifest V3 `side_panel` field + `sidePanel` permission. Chrome 114+.
- **`chrome.storage.local`** — existing; one new key (`'chat'`).

### Dependencies

- **`marked`** (~30KB min+gz) — markdown renderer. Justified because markdown parsing is not a trivial utility (CLAUDE.md rule), and the alternative is writing a subset-parser we'd regret. Sanitize output with `marked`'s built-in escaping — no `dangerouslySetInnerHTML` style injection.
- **No other new deps.** Chat UI is vanilla DOM, matching `src/popup/` convention.

### Security & Privacy

- **`host_permissions`**: remains `http://localhost:11434/*`. If the user points their base URL elsewhere, the connection fails closed — same behavior as today (noted in CLAUDE.md). The config UI should show a warning if the saved base URL is not `localhost:11434`.
- **No content script changes.** The MVP does not read page content. Existing content script remains as-is (form-fill, deferred decision).
- **No telemetry.** Zero analytics or remote logging — load-bearing privacy promise.
- **XSS surface**: `marked` output is inserted into the chat DOM. Use `marked` with `breaks: true, gfm: true` and its built-in sanitizer, or wrap with DOMPurify if review flags it — but prefer no new deps unless a concrete attack is identified.

---

## 5. Risks & Roadmap

### Phased Rollout

- **MVP (this PRD)**: Side panel chat, streaming, markdown, stop, configurable system prompt, model picker. Form-fill untouched.
- **v1.1 candidates (pick based on feedback)**: Page-aware chat (inject current tab's readable text), conversation history with local persistence, export conversation as markdown.
- **v2.0 candidates**: Multi-conversation tabs, tool use / function calling, provider abstraction (OpenAI-compatible endpoints), per-conversation system prompt overrides.

### Technical Risks

1. **Service worker lifetime during streaming.** Chrome can terminate idle service workers after 30s. The long-lived port keeps it alive, but if Ollama stalls with no tokens for >30s, the worker may die mid-response. _Mitigation:_ surface a timeout error in the UI if no token arrives within a threshold (e.g. 30s); user can retry.
2. **NDJSON parsing edge cases.** Ollama streams newline-delimited JSON; a chunk boundary can split a line. _Mitigation:_ buffer incomplete lines across reads (standard pattern, but easy to get wrong — write a unit-level sanity check even without a test runner).
3. **Abort latency.** `AbortController` on `fetch` cancels the HTTP connection, but Ollama may take a moment to stop generating server-side. Acceptable as long as the UI reflects the cancellation immediately; server-side cleanup is Ollama's problem.
4. **Side Panel API browser support.** Requires Chrome 114+. Document minimum version in README. Non-Chromium browsers are out of scope.
5. **`marked` bundle size creep.** Start with core only; if bundle grows >100KB gzipped total, revisit.
6. **Form-fill code rot.** Since form-fill is deferred but present, regressions there during chat work won't be caught. _Mitigation:_ don't touch form-fill code during MVP; if a refactor tempts you (e.g. shared `ollama.ts` changes), smoke-test form-fill manually before shipping.

### Verification (End-to-End)

1. `pnpm build` succeeds with no TS errors (`pnpm typecheck` clean).
2. Load `dist/` as unpacked extension at `chrome://extensions`.
3. Confirm Ollama is running with `OLLAMA_ORIGINS=chrome-extension://*` and at least one model pulled.
4. Click Fillix toolbar icon → side panel opens.
5. Run all 10 smoke-test prompts from §3; confirm pass bar.
6. Change base URL to a bad value → confirm inline error, not silent failure.
7. Change system prompt → send message → observe new behavior without reload.
8. Click "New conversation" → history cleared.
9. Capture `chrome://net-export` for a 5-message session → confirm no non-localhost egress.
10. Manually smoke-test existing popup form-fill to confirm no regression.

---

## Critical Files Reference

- `manifest.config.ts` — add side panel entry + permission
- `src/background.ts:5-27` — extend with `onConnect` port handler for chat streaming
- `src/lib/ollama.ts:10-43` — add `chatStream()` alongside existing `listModels` / `inferFieldValue`
- `src/lib/storage.ts` — add `getChatConfig` / `setChatConfig` following existing pattern
- `src/types.ts:19-26` — extend `Message` / `MessageResponse` discriminated unions
- `src/popup/main.ts` — reference pattern for vanilla DOM side-panel UI (do NOT modify)
