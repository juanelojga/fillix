# PRD: Chat Response Beautifier

## 1. Executive Summary

**Problem Statement:** LLM responses frequently arrive with structural and stylistic defects — inconsistent heading levels, wall-of-text paragraphs, mixed list styles, verbose phrasing — that make the chat window hard to read even after markdown rendering.

**Proposed Solution:** Add a post-processing LLM call that runs after every assistant response completes, cleans the raw text against a configurable system prompt, and commits the beautified result to the chat store before markdown rendering. Instructions are optionally sourced from an Obsidian note.

**Success Criteria:**

- Beautified response replaces raw response in < 3 s on a local Ollama model (llama3.2, M-series Mac baseline).
- A loading indicator is visible for the entire duration of the beautify call.
- When no Obsidian path is configured, a hardcoded default prompt is used and the feature works without any setup.
- When an Obsidian path is configured and the note is reachable, its full content is used as the beautifier system prompt — no fallback blending.
- When an Obsidian path is configured but the note is unreachable (Obsidian offline, path wrong), a visible inline error is shown and the raw text is committed unchanged.

---

## 2. User Experience & Functionality

### User Personas

- **Power user with Obsidian** — wants precise, personal instructions for tone, formatting, and vocabulary. Maintains a vault note that evolves over time.
- **Default user** — benefits from cleaner responses without any configuration.

### User Stories

| #   | Story                                                                                                                                                | Acceptance Criteria                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1  | As a user, I want every assistant response to be automatically cleaned up before I read it, so that I don't have to mentally parse messy LLM output. | After `done` fires, a loading indicator replaces the message bubble content. Once the beautify call resolves, the cleaned text is shown and rendered through the markdown pipeline.                    |
| U2  | As a power user, I want to write my own beautifier instructions in an Obsidian note, so that the output matches my personal style.                   | Settings → Obsidian section exposes a "Beautifier prompt path" field. Saving a valid path causes all subsequent beautify calls to use that note's content as the system prompt.                        |
| U3  | As a user, I want to know if the beautifier fails, so that I'm not confused by missing or stale output.                                              | If the beautify LLM call errors (provider down, timeout) or the Obsidian note is unreachable, the raw text is committed unchanged and a subtle inline error label is shown beneath the message bubble. |

### User Flow

```
Assistant stream ends
      │
      ▼
MessageBubble enters "beautifying" state
(3-dot pulse or "Polishing…" label)
      │
      ├─ background fetches Obsidian note (if path set)
      │       └─ unreachable → commit raw text + show inline error
      │
      ├─ background calls LLM: isolated single-shot
      │   system: beautifier prompt (Obsidian note OR hardcoded default)
      │   user:   raw assistant content
      │       └─ error → commit raw text + show inline error
      │
      ▼
Beautified text committed to messages store
      │
      ▼
renderMarkdown() → marked → DOMPurify → prose HTML
```

### Non-Goals

- No toggle to disable the beautifier — it is always on.
- No per-message opt-out.
- No streaming of the beautify response — single-shot only.
- The Obsidian note is not edited or created by the extension — read-only.
- The beautifier does not have access to chat history, tools, or the user's profile.

---

## 3. AI System Requirements

### Beautifier System Prompt (Hardcoded Default)

```
You are a formatting assistant. Rewrite the text below to be clean, concise,
and well-structured. Fix heading hierarchy, unify list styles, break up
wall-of-text paragraphs, and remove filler phrases. Preserve all factual
content and code blocks exactly. Return only the rewritten text — no
explanations, no preamble.
```

### Isolated Call Contract

- **Input:** `[{ role: 'user', content: <raw assistant text> }]`
- **System:** beautifier prompt (Obsidian note content or default above)
- **No tools.** No history. No profile injected.
- **Same provider + model** as the active chat session (reuses `ProviderConfig`).
- Response is the full replacement text; no JSON wrapping expected.

### Evaluation Strategy

- Manual spot-check: 10 intentionally malformed LLM responses (mixed lists, bad headings, verbose prose) passed through the beautifier — all 10 must render noticeably cleaner.
- Regression check: 5 already-well-formatted responses must pass through unchanged (no content removed, no hallucinated sentences added).

---

## 4. Technical Specifications

### Architecture — New Message Types

Two new variants added to the `PortMessage` union in `src/types.ts`:

```ts
| { type: 'BEAUTIFY'; content: string }          // sidepanel → background
| { type: 'beautified'; content: string }         // background → sidepanel
| { type: 'beautify-error'; reason: string }      // background → sidepanel
```

### Background (`chat-runner.ts`)

`handleChatPort` gains a third `msg.type` branch alongside `CHAT_START` / `CHAT_STOP`:

```
case 'BEAUTIFY':
  1. getObsidianConfig() → if beautifierPromptPath set, fetch note via
     Obsidian REST API (GET /vault/<path>)
       └─ on failure → port.postMessage({ type: 'beautify-error', reason })
          return
  2. resolveProvider(providerConfig).chatStream(
       messages: [{ role: 'user', content: msg.content }],
       system: <note content | default prompt>,
       { signal, onDone: resolve, onError: reject }
     )
  3. port.postMessage({ type: 'beautified', content: accumulated })
```

### Settings — Obsidian Panel (`ObsidianPanel.svelte`)

Add a second path field below the existing `systemPromptPath`:

```
Label: "Beautifier prompt path"
Placeholder: "prompts/beautifier.md"
Storage key: ObsidianConfig.beautifierPromptPath (optional string)
```

### Storage (`ObsidianConfig` in `src/types.ts`)

```ts
// existing
systemPromptPath?: string;
// new
beautifierPromptPath?: string;
```

### Sidepanel (`ChatTab.svelte`)

On `done`:

1. Do **not** commit to `messages` yet.
2. Set `activeMessage` to a new `'beautifying'` sub-state.
3. Send `{ type: 'BEAUTIFY', content: rawContent }` on `chatPort`.

On `beautified`:

1. Commit beautified content to `messages`.
2. Clear `activeMessage`.

On `beautify-error`:

1. Commit raw content to `messages` (unchanged).
2. Attach `{ beautifyError: reason }` to the committed message for inline display.

### `MessageBubble.svelte`

Add a "beautifying" visual state between streaming and finished:

- Show the same 3-dot animated bounce as the streaming empty state, or a text label `"Polishing…"` — TBD on design.
- After commit, optionally show a small inline `"Could not beautify"` label if `beautifyError` is present.

### `ChatMessage` type (`src/types.ts`)

```ts
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  beautifyError?: string; // present only when beautify failed
}
```

### Integration Points

- **Obsidian Local REST API** — `GET http://<host>:<port>/vault/<path>` with `Authorization: Bearer <apiKey>`. Already used by `agent-log.ts`; reuse the same fetch pattern.
- **LLM Provider** — reuses `resolveProvider()` + `chatStream()`, same as the main chat loop. No new dependencies.

### Security & Privacy

- Beautifier prompt fetched from Obsidian is never logged or stored beyond the single call.
- `redact()` from `agent-log.ts` applies to any error messages emitted on the port to strip API keys.
- The beautify call inherits the same `AbortController` lifecycle as the port — cancels if the port disconnects.

---

## 5. Risks & Roadmap

### Phased Rollout

**MVP**

- `BEAUTIFY` / `beautified` / `beautify-error` port messages wired end-to-end.
- Hardcoded default beautifier prompt.
- "Polishing…" loading state in `MessageBubble`.
- Raw text fallback + inline error on failure.

**v1.1**

- `beautifierPromptPath` field in Obsidian settings panel.
- Note fetched and used as system prompt; graceful error if unreachable.

**v2.0 (stretch)**

- Allow the user to type a custom prompt directly in Settings (no Obsidian required).

### Technical Risks

| Risk                                             | Likelihood        | Impact | Mitigation                                                                                                    |
| ------------------------------------------------ | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Beautify call adds > 5 s latency on slow models  | Medium            | Medium | No timeout beyond provider default; user can stop stream, which aborts the port                               |
| LLM hallucinates content during beautification   | Low               | High   | Default prompt explicitly says "preserve all factual content and code blocks exactly"; evaluate in spot-check |
| Obsidian note not found / wrong path             | High (mis-config) | Low    | Inline error shown; raw text committed; no silent failure                                                     |
| Port disconnect mid-beautify (user closes panel) | Low               | Low    | AbortController cancels the in-flight call                                                                    |
