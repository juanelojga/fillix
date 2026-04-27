# Plan: Chat Response Beautifier

**Generated**: 2026-04-24
**Estimated Complexity**: Medium

## Overview

After every assistant stream completes, send the raw text through an isolated single-shot LLM call that cleans formatting, then commit the beautified result to the `messages` store before markdown rendering. The feature is always-on and works without any setup via a hardcoded default prompt. An optional Obsidian `beautifierPromptPath` setting (v1.1) lets power users supply their own instructions.

All new port messages follow the existing `PortMessage` discriminated union pattern. The background handler lives in `chat-runner.ts` alongside `CHAT_START`/`CHAT_STOP`. The sidepanel intercepts the existing `done` message and delays the `messages` commit until beautification resolves or fails.

## Prerequisites

- Existing `chatStream()` / `resolveProvider()` infrastructure (already in `src/lib/providers/`)
- Existing Obsidian REST fetch pattern (already in `src/lib/agent-log.ts` / `ObsidianPanel.svelte`)
- No new npm dependencies required

---

## Sprint 1: MVP — end-to-end beautify with hardcoded prompt

**Goal**: Every assistant response passes through the beautifier before being committed to the messages store. A "Polishing…" indicator is shown during the call. On failure, raw text is committed with an inline error label.

**Demo/Validation**:

- Start a chat; after the stream ends, the bubble should show "Polishing…" for a moment, then display the cleaned text.
- Kill Ollama mid-beautify (or point to a bad model) — raw text should appear with a "Could not beautify" label below the bubble.
- Run `pnpm typecheck` — zero errors.

---

### Task 1.1: Extend `PortMessage` union and `ChatMessage` type

- **Location**: `src/types.ts`
- **Description**:
  1. Add three new variants to the `PortMessage` union:
     ```ts
     | { type: 'BEAUTIFY'; content: string; providerConfig: ProviderConfig }
     | { type: 'beautified'; content: string }
     | { type: 'beautify-error'; reason: string }
     ```
  2. Extend `ChatMessage` with an optional error field:
     ```ts
     export interface ChatMessage {
       role: 'user' | 'assistant';
       content: string;
       beautifyError?: string;
     }
     ```
     **Note**: `providerConfig` is passed in the `BEAUTIFY` message because `chat-runner.ts` only has access to it within the `CHAT_START` handler closure; it is not cached on the port.
- **Dependencies**: none
- **Acceptance Criteria**:
  - `pnpm typecheck` passes.
  - `PortMessage` is a valid discriminated union with no overlapping `type` literals.
- **Validation**: `pnpm typecheck`

---

### Task 1.2: Add `BEAUTIFY` handler to `chat-runner.ts`

- **Location**: `src/lib/chat-runner.ts`
- **Description**:
  Add a third `msg.type` branch in the port message listener alongside `CHAT_START` / `CHAT_STOP`:

  ```ts
  const DEFAULT_BEAUTIFIER_PROMPT =
    `You are a formatting assistant. Rewrite the text below to be clean, concise, ` +
    `and well-structured. Fix heading hierarchy, unify list styles, break up ` +
    `wall-of-text paragraphs, and remove filler phrases. Preserve all factual ` +
    `content and code blocks exactly. Return only the rewritten text — no ` +
    `explanations, no preamble.`;

  case 'BEAUTIFY': {
    const beautifyController = new AbortController();
    const onPortDisconnect = () => beautifyController.abort();
    port.onDisconnect.addListener(onPortDisconnect);

    try {
      const provider = resolveProvider(msg.providerConfig);
      let accumulated = '';
      await new Promise<void>((resolve, reject) => {
        provider.chatStream(
          [{ role: 'user', content: msg.content }],
          DEFAULT_BEAUTIFIER_PROMPT,
          {
            signal: beautifyController.signal,
            onToken: (t) => { accumulated += t; },
            onDone: resolve,
            onError: (e) => reject(new Error(e)),
          }
        );
      });
      port.postMessage({ type: 'beautified', content: accumulated });
    } catch (err) {
      const reason = redact(err instanceof Error ? err.message : String(err));
      port.postMessage({ type: 'beautify-error', reason });
    } finally {
      port.onDisconnect.removeListener(onPortDisconnect);
    }
    break;
  }
  ```

  Import `redact` from `./agent-log` (already a project module).

- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - `BEAUTIFY` message triggers a single-shot LLM call using the incoming `providerConfig`.
  - A port disconnect during the call aborts it silently (no unhandled rejection).
  - On success, `{ type: 'beautified', content }` is posted.
  - On error, `{ type: 'beautify-error', reason }` is posted with API keys redacted.
- **Validation**: `pnpm typecheck`; manual test with Ollama.

---

### Task 1.3: Intercept `done` in `ChatTab.svelte` and handle beautify messages

- **Location**: `src/sidepanel/tabs/ChatTab.svelte`
- **Description**:
  Modify the port message listener. The existing `done` handler commits `activeMessage` to `messages` immediately — this must be deferred until beautification resolves.

  Replace the current `case 'done'` block:

  ```ts
  case 'done': {
    const current = get(activeMessage);
    if (!current) break;
    // Enter beautifying sub-state: keep activeMessage alive but mark it
    activeMessage.update(m => m ? { ...m, beautifying: true } : m);
    streamingState.set('beautifying');
    chatPort.postMessage({
      type: 'BEAUTIFY',
      content: current.content,
      providerConfig: get(providerConfigStore),  // read from existing settings store
    });
    break;
  }

  case 'beautified': {
    const current = get(activeMessage);
    messages.update(msgs => [
      ...msgs,
      { role: 'assistant', content: msg.content },
    ]);
    activeMessage.set(null);
    streamingState.set('idle');
    break;
  }

  case 'beautify-error': {
    const current = get(activeMessage);
    messages.update(msgs => [
      ...msgs,
      {
        role: 'assistant',
        content: current?.content ?? '',
        beautifyError: msg.reason,
      },
    ]);
    activeMessage.set(null);
    streamingState.set('idle');
    break;
  }
  ```

  **Regarding `providerConfigStore`**: inspect how `providerConfig` is read in `ChatTab.svelte` when building the `CHAT_START` message — use the same store/getter here.

  **Regarding `activeMessage` shape**: add `beautifying?: boolean` to the `ActiveMessage` interface in `src/sidepanel/stores/chat.ts` so `MessageBubble` can key off it.

- **Dependencies**: Task 1.1, Task 1.2
- **Acceptance Criteria**:
  - Raw text is never pushed to `messages` before `beautified` or `beautify-error` fires.
  - `streamingState` transitions: `'streaming'` → `'beautifying'` → `'idle'`.
  - On `beautify-error`, raw content is committed with `beautifyError` set.
- **Validation**: `pnpm typecheck`; manual end-to-end chat test.

---

### Task 1.4: Add `beautifying` visual state to `MessageBubble.svelte`

- **Location**: `src/sidepanel/components/MessageBubble.svelte`
- **Description**:
  The component currently receives an `isStreaming` boolean prop. Extend it to also accept `isBeautifying` and `beautifyError` props:

  ```ts
  export let isBeautifying: boolean = false;
  export let beautifyError: string | undefined = undefined;
  ```

  In the assistant branch, add a new conditional block between the streaming state and the finished state:

  ```svelte
  {:else if isBeautifying}
    <span class="polishing-label">Polishing…</span>
  {:else}
    {@html renderMarkdown(content)}
    {#if beautifyError}
      <p class="beautify-error-label">Could not beautify</p>
    {/if}
  {/if}
  ```

  Style `polishing-label` the same as the existing streaming dots (muted foreground, same font size). Style `beautify-error-label` with a subtle red or warning tone, small text, no icon needed.

  In `ChatTab.svelte`, pass these props to the `MessageBubble` for `$activeMessage`:

  ```svelte
  <MessageBubble
    role="assistant"
    content={$activeMessage.content}
    isStreaming={$streamingState === 'streaming'}
    isBeautifying={$streamingState === 'beautifying'}
  />
  ```

  And for committed messages:

  ```svelte
  <MessageBubble
    role={msg.role}
    content={msg.content}
    beautifyError={msg.beautifyError}
  />
  ```

- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - While `streamingState === 'beautifying'`, the bubble shows "Polishing…" instead of the streamed content or dots.
  - After commit, messages with `beautifyError` show a subtle inline error label.
  - No visual regression in streaming or idle states.
- **Validation**: Manual UI walkthrough; `pnpm typecheck`.

---

## Sprint 2: Obsidian `beautifierPromptPath` setting

**Goal**: Power users can store their own beautifier instructions in an Obsidian note. When the path is set and reachable, that note's content is used as the system prompt. When unreachable, an inline error is shown and raw text is committed.

**Demo/Validation**:

- Add `beautifierPromptPath = "prompts/beautifier.md"` in Settings.
- Send a chat message — the Obsidian note content should drive formatting.
- Take Obsidian offline — the error path should surface and raw text should appear.

---

### Task 2.1: Add `beautifierPromptPath` to `ObsidianConfig`

- **Location**: `src/types.ts`
- **Description**:
  ```ts
  export interface ObsidianConfig {
    host: string;
    port: number;
    apiKey: string;
    systemPromptPath?: string;
    beautifierPromptPath?: string; // new
  }
  ```
- **Dependencies**: none (can run in parallel with Task 2.2)
- **Acceptance Criteria**: `pnpm typecheck` passes.
- **Validation**: `pnpm typecheck`

---

### Task 2.2: Fetch Obsidian note in `BEAUTIFY` handler

- **Location**: `src/lib/chat-runner.ts`
- **Description**:
  At the top of the `BEAUTIFY` case block (before calling `provider.chatStream()`), add an Obsidian note fetch step:

  ```ts
  // Read ObsidianConfig from storage at call time (not passed in the message)
  import { getObsidianConfig } from './storage'; // adjust to actual export path

  const obsidianConfig = await getObsidianConfig();
  let systemPrompt = DEFAULT_BEAUTIFIER_PROMPT;

  if (obsidianConfig?.beautifierPromptPath) {
    const { host, port: obsPort, apiKey, beautifierPromptPath } = obsidianConfig;
    const url = `http://${host}:${obsPort}/vault/${encodeURIComponent(beautifierPromptPath)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: beautifyController.signal,
    });
    if (!resp.ok) {
      const reason = `Obsidian note unreachable (${resp.status})`;
      port.postMessage({ type: 'beautify-error', reason });
      return; // raw text committed by sidepanel on beautify-error
    }
    systemPrompt = await resp.text();
  }
  ```

  The existing `agent-log.ts` Obsidian REST fetch uses the same `http://<host>:<port>/vault/<path>` + `Bearer <apiKey>` pattern — mirror it exactly.

  **Important**: If the fetch throws (e.g. network error, AbortError), fall into the existing `catch` block which emits `beautify-error`. No separate try/catch needed.

- **Dependencies**: Task 2.1, Task 1.2
- **Acceptance Criteria**:
  - When `beautifierPromptPath` is unset, the hardcoded default is used (no network call).
  - When set and reachable, the note content is used verbatim as the system prompt.
  - When set and unreachable (404, offline), `beautify-error` is emitted; raw text committed.
- **Validation**: `pnpm typecheck`; manual test with Obsidian on/off.

---

### Task 2.3: Add `beautifierPromptPath` field to `ObsidianPanel.svelte`

- **Location**: `src/sidepanel/components/ObsidianPanel.svelte`
- **Description**:
  Mirror the existing `systemPromptPath` field exactly but for the new key.

  Add to component state:

  ```ts
  let beautifierPromptPath = '';
  ```

  Load in `onMount` (extend the existing `getObsidianConfig()` call):

  ```ts
  beautifierPromptPath = config.beautifierPromptPath ?? '';
  ```

  Include in `handleSave`:

  ```ts
  beautifierPromptPath: beautifierPromptPath || undefined,
  ```

  Add the form field below `systemPromptPath`:

  ```svelte
  <label for="beautifier-prompt-path">Beautifier prompt path</label>
  <input
    id="beautifier-prompt-path"
    type="text"
    bind:value={beautifierPromptPath}
    placeholder="prompts/beautifier.md"
  />
  ```

- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Field renders below "System prompt path" in the Obsidian panel.
  - Saving persists the value to storage.
  - Clearing the field removes the key from storage (undefined, not empty string).
- **Validation**: Manual Settings UI check; verify storage via DevTools → Extension Storage.

---

## Testing Strategy

| Sprint | What to verify                                                                              |
| ------ | ------------------------------------------------------------------------------------------- |
| 1      | Stream ends → "Polishing…" appears → beautified text renders (no raw text flashes through)  |
| 1      | Kill Ollama before beautify resolves → raw text commits with "Could not beautify" label     |
| 1      | Close the sidepanel mid-beautify → no unhandled errors in background service worker console |
| 1      | 5 well-formatted responses pass through unchanged in content (spot-check)                   |
| 1      | 10 malformed responses render noticeably cleaner (spot-check)                               |
| 2      | Valid `beautifierPromptPath` → note content drives formatting                               |
| 2      | Invalid path (404) → inline error, raw text committed                                       |
| 2      | Obsidian offline with path set → inline error, raw text committed                           |
| 2      | Empty `beautifierPromptPath` field → falls back to hardcoded default                        |

Run `pnpm typecheck` and `pnpm test` after each sprint.

---

## Potential Risks & Gotchas

| Risk                                                                                                                     | Mitigation                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerConfig` not accessible in `ChatTab.svelte` at `done` time                                                       | Check how `CHAT_START` reads provider config — it likely uses a Svelte store; read the same store in the `done` handler                      |
| `activeMessage` shape change breaks `ThinkingBlock` / `ToolCallBlock` rendering                                          | Add `beautifying?: boolean` as optional on `ActiveMessage`; existing consumers only read `content`/`thinking`/`toolCalls` and are unaffected |
| `StreamingState` type is a string union — `'beautifying'` must be added                                                  | Find and update the type definition in `src/sidepanel/stores/chat.ts`                                                                        |
| The `chatStream()` `onDone` callback and the Promise resolve may have different timing across providers                  | The `await new Promise<void>()` wrapping is safe: `onDone` resolves it, `onError` rejects it; test with both Ollama and OpenAI               |
| Obsidian `GET /vault/<path>` returns the raw file content as plain text, not JSON                                        | No JSON parsing needed; `resp.text()` is correct                                                                                             |
| Port `onDisconnect` listener registered inside the message handler — must be removed in `finally` to avoid listener leak | The `finally` block in Task 1.2 handles this; double-check with Chrome DevTools memory tools if extended use is a concern                    |
| Beautify call on a slow local model may add 5–15 s perceived latency                                                     | No mitigation beyond the "Polishing…" label; user story U3 only requires transparency, not speed control                                     |

## Rollback Plan

All changes are additive (new message types, new optional fields, new UI state). To roll back:

1. Remove the three `PortMessage` variants from `types.ts`.
2. Revert `ChatTab.svelte` `done` handler to immediately commit to `messages`.
3. Remove the `BEAUTIFY` case from `chat-runner.ts`.
4. Remove `isBeautifying` / `beautifyError` props from `MessageBubble.svelte`.
5. Remove `beautifierPromptPath` from `ObsidianConfig` and `ObsidianPanel.svelte`.

No data migration needed — `beautifyError` is never persisted to `chrome.storage`.
