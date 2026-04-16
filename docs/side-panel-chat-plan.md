# Plan: Fillix Side-Panel Chat MVP

**Generated**: 2026-04-16
**Estimated Complexity**: High

## Context

Fillix is pivoting from form auto-fill to a side-panel chat as the headline feature. The chat must stream responses from a local Ollama instance, render markdown, allow mid-stream abort, and be fully configurable (base URL, model, system prompt) — all with zero cloud egress. The existing form-fill code stays untouched.

Toolbar click opens the side panel directly (not the popup) via `chrome.sidePanel.setPanelBehavior`. Markdown output is sanitized with `marked` + `DOMPurify`.

## Prerequisites

- `pnpm add marked dompurify && pnpm add -D @types/dompurify`
- Ollama running with `OLLAMA_ORIGINS=chrome-extension://*` and at least one model pulled

## Critical Files

| File                        | Action                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `manifest.config.ts`        | Add `side_panel`, `sidePanel` permission, wire toolbar click            |
| `src/types.ts`              | Extend Message/MessageResponse unions; add port message shapes          |
| `src/lib/storage.ts`        | Add `getChatConfig` / `setChatConfig` for new `'chat'` key              |
| `src/lib/ollama.ts`         | Add `chatStream()` for `/api/chat` with streaming + abort               |
| `src/background.ts`         | Add `onConnect` handler for `'chat'` port; call `setPanelBehavior`      |
| `src/sidepanel/index.html`  | New — shell with chat view + settings view                              |
| `src/sidepanel/main.ts`     | New — initialize, wire tab switching, delegate to chat/settings modules |
| `src/sidepanel/chat.ts`     | New — chat state machine (messages, streaming state, port)              |
| `src/sidepanel/markdown.ts` | New — thin `marked` + `DOMPurify` wrapper                               |

---

## Sprint 1: Foundation — Manifest, Types, Storage, Deps

**Goal**: Extension loads with side panel declared; types and storage are ready for streaming.

**Demo/Validation**:

- `pnpm build` passes with no TS errors
- Load `dist/` unpacked; Chrome shows no manifest errors
- Clicking the toolbar icon opens the side panel (even if empty)

### Task 1.1: Install dependencies

- **Command**: `pnpm add marked dompurify && pnpm add -D @types/dompurify`
- **Acceptance Criteria**: Packages appear in `package.json`; `pnpm typecheck` still passes.

### Task 1.2: Update `manifest.config.ts`

- **Location**: `manifest.config.ts`
- **Changes**:
  1. Remove `default_popup` from `action` (keep `action: {}` so the toolbar icon remains).
  2. Add `"side_panel": { "default_path": "src/sidepanel/index.html" }`.
  3. Add `"sidePanel"` to `permissions` array.
- **Acceptance Criteria**: `chrome://extensions` shows no manifest errors after reload.

### Task 1.3: Extend `src/types.ts`

- **Location**: `src/types.ts`
- **Changes**: Add to the `Message` discriminated union:

  ```typescript
  | { type: 'CHAT_START'; messages: ChatMessage[]; systemPrompt: string }
  | { type: 'CHAT_STOP' }
  ```

  Add new types:

  ```typescript
  export type ChatMessage = { role: 'user' | 'assistant'; content: string };

  // Used over chrome.runtime.Port — separate from MessageResponse
  export type PortMessage =
    | { type: 'token'; value: string }
    | { type: 'done' }
    | { type: 'error'; error: string };
  ```

  Add a no-op `ok: true` variant to `MessageResponse` for `CHAT_STOP` acknowledgment.

- **Acceptance Criteria**: `pnpm typecheck` passes; exhaustiveness check in `background.ts` compiles (add stub cases for new message types).

### Task 1.4: Add chat config to `src/lib/storage.ts`

- **Location**: `src/lib/storage.ts`
- **Changes**: Follow the exact pattern of `getOllamaConfig` / `setOllamaConfig`:

  ```typescript
  export type ChatConfig = { systemPrompt: string }

  const CHAT_DEFAULTS: ChatConfig = {
    systemPrompt:
      'You are a helpful assistant running locally via Ollama. Keep answers concise unless asked for detail.',
  }

  export async function getChatConfig(): Promise<ChatConfig> { ... }
  export async function setChatConfig(chat: ChatConfig): Promise<void> { ... }
  ```

  Storage key: `'chat'`.

- **Acceptance Criteria**: `pnpm typecheck` passes; functions are exported.

---

## Sprint 2: Streaming Infrastructure

**Goal**: Background service worker can stream Ollama `/api/chat` tokens to the side panel over a long-lived port.

**Demo/Validation**:

- Open DevTools → Service Worker console; manually connect via `chrome.runtime.connect({ name: 'chat' })` in the Extensions console → tokens appear in console logs.
- Sending `CHAT_STOP` aborts the stream.

### Task 2.1: Add `chatStream()` to `src/lib/ollama.ts`

- **Location**: `src/lib/ollama.ts`
- **Signature**:
  ```typescript
  export async function chatStream(
    config: OllamaConfig,
    messages: ChatMessage[],
    systemPrompt: string,
    options: {
      signal: AbortSignal;
      onToken: (token: string) => void;
      onDone: () => void;
      onError: (err: string) => void;
    },
  ): Promise<void>;
  ```
- **Implementation**:
  1. `POST ${config.baseUrl}/api/chat` with `{ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], stream: true }`.
  2. Read `response.body.getReader()` in a loop.
  3. **Buffer incomplete lines across chunks** (the most error-prone part — a chunk may cut mid-JSON line).
  4. Parse each complete line; call `onToken(line.message.content)` until `done === true`, then call `onDone()`.
  5. Respect `signal` — break immediately on abort; do not call `onDone` or `onError`.
  6. Catch fetch/parse errors → `onError(err.message)`.
- **Acceptance Criteria**: Chunk-boundary splits handled correctly; aborts within one read-loop tick.

### Task 2.2: Add `onConnect` handler to `src/background.ts`

- **Location**: `src/background.ts`
- **Changes**:
  1. At top level (service worker startup):
     ```typescript
     chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
     ```
  2. Add port listener:

     ```typescript
     chrome.runtime.onConnect.addListener((port) => {
       if (port.name !== 'chat') return;
       let controller: AbortController | null = null;

       port.onMessage.addListener(async (msg: Message) => {
         if (msg.type === 'CHAT_START') {
           controller = new AbortController();
           const config = await getOllamaConfig();
           await chatStream(config, msg.messages, msg.systemPrompt, {
             signal: controller.signal,
             onToken: (value) => port.postMessage({ type: 'token', value } satisfies PortMessage),
             onDone: () => port.postMessage({ type: 'done' } satisfies PortMessage),
             onError: (err) =>
               port.postMessage({ type: 'error', error: err } satisfies PortMessage),
           });
         } else if (msg.type === 'CHAT_STOP') {
           controller?.abort();
         }
       });

       port.onDisconnect.addListener(() => controller?.abort());
     });
     ```

  3. Keep existing `onMessage` handler untouched.

- **Acceptance Criteria**: Existing `OLLAMA_INFER` / `OLLAMA_LIST_MODELS` still work; port aborts cleanly on `CHAT_STOP` and disconnect.

---

## Sprint 3: Side Panel UI Shell + Chat State Machine

**Goal**: Side panel opens with a working chat interface — messages send, tokens stream, stop and new-conversation work.

**Demo/Validation**:

- Click toolbar → side panel opens
- Type a message, press Enter → tokens stream into the assistant bubble
- Shift+Enter inserts a newline (no send)
- Stop button halts the response within 300ms; partial message is preserved
- "New conversation" clears all messages

### Task 3.1: Create `src/sidepanel/index.html`

- **Location**: `src/sidepanel/index.html` (new file)
- **Structure**:
  ```
  ┌──────────────────────────────────┐
  │  [Chat] [Settings]  [New conv.]  │  ← header / tab bar
  ├──────────────────────────────────┤
  │  #chat-view                      │
  │    #messages (overflow-y: auto)  │
  │    #input-row                    │
  │      textarea#input              │
  │      button#send / button#stop   │
  │                                  │
  │  #settings-view (hidden)         │
  │    [covered in Sprint 4]         │
  └──────────────────────────────────┘
  ```
  Load `main.ts` as `<script type="module">`. Inline CSS only (no external stylesheet). Scrolls `#messages` to bottom on new content.
- **Acceptance Criteria**: crxjs picks it up on `pnpm build`; HTML validates.

### Task 3.2: Create `src/sidepanel/chat.ts`

- **Location**: `src/sidepanel/chat.ts` (new file)
- **Description**: Encapsulates chat state; does **not** touch the DOM.

  ```typescript
  export type ChatState = 'idle' | 'streaming';

  export function createChatController(options: {
    onToken: (token: string) => void;
    onDone: () => void;
    onError: (err: string) => void;
  }): {
    send(userText: string, systemPrompt: string): void;
    stop(): void;
    clear(): void;
    messages: ChatMessage[];
    state: ChatState;
  };
  ```

  - Opens `chrome.runtime.connect({ name: 'chat' })` lazily on first `send()`; re-opens if the port disconnects (handles service worker restarts).
  - Maintains `messages: ChatMessage[]` in memory: push user message first, then accumulate assistant tokens into the last message.
  - On `done`: finalize assistant message, set `state = 'idle'`.
  - `clear()`: empty `messages`, set `state = 'idle'`.

- **Acceptance Criteria**: `pnpm typecheck` passes; port is re-opened after disconnect.

### Task 3.3: Create `src/sidepanel/main.ts`

- **Location**: `src/sidepanel/main.ts` (new file)
- **Description**: Vanilla DOM wiring, modeled after `src/popup/main.ts`.
  1. On `DOMContentLoaded`: load config via `getOllamaConfig()` + `getChatConfig()`.
  2. Instantiate `ChatController` with callbacks:
     - `onToken`: append raw text to the current assistant bubble's `textContent`.
     - `onDone`: re-render the bubble using `renderMarkdown()` (set `innerHTML`).
     - `onError`: show inline error in the bubble including the base URL that was tried.
  3. Wire `#send` + textarea `keydown`:
     - Enter (not Shift+Enter) → `controller.send(input.value.trim(), systemPrompt)` if non-empty.
     - Disable `#send`, show `#stop` while streaming.
  4. Wire `#stop` → `controller.stop()`.
  5. Wire "New conversation" → `controller.clear()` + clear `#messages` DOM.
  6. Wire `#chat-tab` / `#settings-tab` → toggle `hidden` on views.
  7. Read `systemPrompt` from storage at send time (not startup) so config changes apply immediately.
- **Acceptance Criteria**: Full send → stream → done cycle works end-to-end.

---

## Sprint 4: Markdown Rendering + Settings View

**Goal**: Assistant responses render full markdown; user can configure base URL, model, and system prompt from the side panel.

**Demo/Validation**:

- "Write a Python FizzBuzz" → fenced code block renders correctly
- "List 5 steps to deploy a Node app" → ordered list renders
- Change model in settings, save, send → new model used (check Ollama logs)
- Change system prompt, save, send "what are your instructions?" → behavior reflects new prompt

### Task 4.1: Create `src/sidepanel/markdown.ts`

- **Location**: `src/sidepanel/markdown.ts` (new file)
- **Content**:

  ```typescript
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  marked.setOptions({ breaks: true, gfm: true });

  export function renderMarkdown(raw: string): string {
    const html = marked.parse(raw) as string;
    return DOMPurify.sanitize(html);
  }
  ```

  Called only on finalized messages (after `done`). During streaming, update `textContent` only.

- **Acceptance Criteria**: Output is sanitized HTML; inline code, code blocks, bold, lists all render.

### Task 4.2: Add settings view HTML to `src/sidepanel/index.html`

- **Location**: `src/sidepanel/index.html`
- **Elements inside `#settings-view`**:
  - `input#baseUrl` — base URL
  - `select#model` — model dropdown
  - `button#refreshModels` — re-queries `/api/tags`
  - `textarea#systemPrompt` — system prompt
  - `button#saveSettings` — persists to storage
  - `div#settings-status` — inline feedback
  - `div#localhost-warning` (hidden by default) — shown when base URL ≠ `http://localhost:11434`
- **Acceptance Criteria**: All elements present and accessible.

### Task 4.3: Wire settings logic in `src/sidepanel/main.ts`

- **Location**: `src/sidepanel/main.ts`
- **Changes**:
  1. On init: populate `#baseUrl`, `#systemPrompt` from storage; call `refreshModels()` to populate `#model`.
  2. `#refreshModels` click → `chrome.runtime.sendMessage({ type: 'OLLAMA_LIST_MODELS' })` → populate `#model`.
  3. `#saveSettings` click → `setOllamaConfig()` + `setChatConfig()` → show "Saved" in `#settings-status`.
  4. Show `#localhost-warning` when `#baseUrl` value ≠ `http://localhost:11434`.
  5. Config changes take effect on next `controller.send()` — read from storage at send time.
- **Acceptance Criteria**: Settings persist across panel close/reopen; model list populates correctly.

---

## Testing Strategy

Run all 10 smoke-test prompts from PRD §3 manually before release:

| #   | Prompt                                          | Pass condition                          |
| --- | ----------------------------------------------- | --------------------------------------- |
| 1   | "What year is it?"                              | Single-line response renders            |
| 2   | "Write a Python FizzBuzz."                      | Fenced code block renders               |
| 3   | "Explain async/await in 3 paragraphs."          | Paragraphs render                       |
| 4   | "List 5 steps to deploy a Node app."            | Ordered list renders                    |
| 5   | "List frontend frameworks and their strengths." | Nested bullets render                   |
| 6   | "What does `Array.prototype.flat()` do?"        | Inline code renders                     |
| 7   | Long response (>500 tokens)                     | Streaming doesn't stall; auto-scrolls   |
| 8   | Mid-stream stop                                 | Partial message preserved; stop < 300ms |
| 9   | Empty input + Enter                             | No-op; send stays disabled              |
| 10  | Back-to-back sends                              | Turn ordering preserved; no race        |

**Additional checks:**

- `pnpm build` + `pnpm typecheck` clean
- `chrome://net-export` 5-message capture: zero non-localhost egress
- Manually smoke-test existing popup form-fill (no regression)

---

## Potential Risks & Gotchas

1. **NDJSON chunk boundary splits.** A `TextDecoder` chunk may cut a JSON line mid-object. `chatStream` must buffer incomplete lines across reads — the most error-prone part of the implementation.

2. **`chrome.sidePanel.setPanelBehavior` call timing.** Must be called at service worker top level (startup), not inside an event handler. Chrome may ignore it otherwise.

3. **Service worker termination during long streams.** The long-lived port keeps the worker alive, but if Ollama stalls >30s with no tokens, Chrome may terminate it. Surface a timeout error in the UI if no token arrives within 30s.

4. **`marked.parse()` return type.** Returns `string | Promise<string>` depending on version. Cast explicitly or use `await`.

5. **Port re-open after service worker restart.** If the port disconnects mid-session, `chat.ts` must detect the disconnect and lazily re-open it on the next `send()`.

6. **crxjs entry points.** Adding `src/sidepanel/index.html` to `manifest.config.ts` is sufficient — crxjs auto-wires it. No manual Vite `input` config needed.

## Rollback Plan

All changes are additive:

- Revert `manifest.config.ts` (restore `default_popup`, remove `side_panel`) to restore popup-only behavior.
- Remove the `setPanelBehavior` call and `onConnect` handler from `background.ts` — existing `onMessage` handler is untouched.
- `chatStream` in `ollama.ts` is isolated; removing it does not affect `listModels` or `inferFieldValue`.
