# PRD: Obsidian Integration for Fillix

## 1. Executive Summary

**Problem Statement**: The current popup form requires users to manually re-enter personal information that already exists in their Obsidian vault, creating duplication and keeping profile data out of sync. The system prompt for the chat panel is also hardcoded, with no way to version or personalize it.

**Proposed Solution**: Connect Fillix to the Obsidian Local REST API so users can designate one vault document as their profile source and another as their system prompt — both selected once in popup settings and resolved at runtime.

**Success Criteria**:

- Profile data is read from Obsidian without any manual re-entry in the popup form.
- System prompt document is applied to side-panel chat within 500ms of panel open.
- Switching documents takes ≤ 3 clicks inside the popup.
- Obsidian connection failure surfaces a clear error in the popup within 2 seconds.
- Zero plaintext personal data is stored in `chrome.storage` when Obsidian mode is active.

---

## 2. User Experience & Functionality

### User Personas

**Power user / personal knowledge worker** — maintains an Obsidian vault with structured personal notes and curated prompts. Wants the extension to source truth from the vault, not a separate form.

### User Stories & Acceptance Criteria

**Story 1 — Configure the Obsidian connection**

> As a user, I want to enter my Obsidian REST API host/port and API key in popup settings so that Fillix can reach my vault.

Acceptance criteria:

- Popup has an "Obsidian" settings section with: host field (default `localhost`), port field (default `27123`), and API key field (masked input).
- A "Test connection" button calls `GET /` on the REST API and shows "Connected" or a specific error message.
- Settings persist in `chrome.storage.local` under an `obsidian` key.
- `host_permissions` in `manifest.config.ts` includes the configured URL (see Technical Specifications §4).

**Story 2 — Select a profile document**

> As a user, I want to pick an Obsidian markdown file as my profile so that form auto-fill uses it instead of the manual entry form.

Acceptance criteria:

- Popup shows a "Profile document" path input (e.g. `Personal/profile.md`) with a "Browse" button that fetches the vault file list via `GET /vault/` and renders a searchable dropdown.
- When a profile document is set, the manual profile form fields are hidden (not deleted — fallback if Obsidian is unreachable).
- On "Save", the path is stored; the raw document content is **not** cached in storage.
- When form auto-fill runs, background fetches the document via `GET /vault/{path}`, passes the raw markdown as the profile context string to Ollama instead of the structured `UserProfile` object.

**Story 3 — Select a system prompt document**

> As a user, I want to pick an Obsidian markdown file as my chat system prompt so that the side-panel chat uses my curated prompt.

Acceptance criteria:

- Popup shows a "System prompt document" path input with the same Browse UX as Story 2.
- When set, it overrides the hardcoded default in `storage.ts`; the inline text field for the system prompt (if one exists) is hidden.
- When the side panel opens, background fetches the document and supplies it as the `systemPrompt` in `CHAT_START`.
- If fetch fails, falls back to the stored text system prompt with a visible warning in the side panel.

**Story 4 — Graceful degradation**

> As a user, if Obsidian is not running, I want Fillix to fall back to manual profile/system prompt without breaking.

Acceptance criteria:

- Any Obsidian fetch failure logs a warning and falls back to `chrome.storage`-based profile and system prompt.
- Popup shows an amber "Obsidian unreachable — using local fallback" indicator when the last connection attempt failed.
- Form fill and chat remain fully functional without Obsidian.

### Non-Goals

- **Vault write-back**: Fillix will not write or modify any Obsidian documents.
- **Live sync / watching**: Documents are fetched on-demand; no polling or webhook.
- **Multiple vault support**: One vault connection per extension install.
- **Parsing/structuring the markdown**: Obsidian documents are passed as raw text to Ollama. No heading extraction or frontmatter parsing.
- **Obsidian URI deep links**: No `obsidian://` protocol use.

---

## 3. AI System Requirements

**Profile context change**: `OLLAMA_INFER` currently receives a `UserProfile` key/value map. When Obsidian mode is active, it will instead receive a `profileMarkdown: string` field. The Ollama prompt template must be updated to embed this raw text block and instruct the model to extract the relevant value from it.

**Prompt template requirements**:

- Must include an explicit instruction: _"The following is the user's personal information document. Extract only the value relevant to the field described below. Return `{"value": ""}` if the information is not present."_
- Must not expand or hallucinate data not present in the document (existing invariant, reinforced).

**Evaluation strategy**:

- Manual test matrix: 5 representative field types (name, email, address, phone, job title) × 3 document styles (prose paragraph, bulleted list, frontmatter YAML) = 15 cases.
- Pass criterion: correct value returned or empty string; no hallucinated values.

---

## 4. Technical Specifications

### Architecture Overview

```
popup settings
  └─ stores ObsidianConfig { host, port, apiKey, profilePath, systemPromptPath }
        │
        ▼
background.ts  (new message types)
  ├─ OBSIDIAN_LIST_FILES  →  GET /vault/   →  returns string[]
  └─ OBSIDIAN_GET_FILE    →  GET /vault/{path}  →  returns raw markdown

content.ts / side panel
  └─ on fill / on chat open: background fetches file, passes markdown downstream
```

All Obsidian HTTP calls are routed through the background service worker (same pattern as Ollama) to keep the `chrome-extension://*` origin stable.

### New Types (`src/types.ts`)

```typescript
export interface ObsidianConfig {
  host: string;       // default: "localhost"
  port: number;       // default: 27123
  apiKey: string;
  profilePath?: string;        // vault-relative path, e.g. "Personal/profile.md"
  systemPromptPath?: string;
}

// Message additions
| { type: 'OBSIDIAN_LIST_FILES' }
| { type: 'OBSIDIAN_GET_FILE'; path: string }

// MessageResponse additions
| { ok: true; files: string[] }
| { ok: true; content: string }
```

### New Storage Key (`src/lib/storage.ts`)

```typescript
export async function getObsidianConfig(): Promise<ObsidianConfig>;
export async function setObsidianConfig(config: ObsidianConfig): Promise<void>;
```

Stored under `obsidian` key in `chrome.storage.local`. `apiKey` stored as-is (local storage, extension sandbox — acceptable); no cloud sync.

### New Library (`src/lib/obsidian.ts`)

Thin client mirroring `ollama.ts` style:

- `listFiles(config): Promise<string[]>` — `GET /vault/` with `Authorization: Bearer {apiKey}`
- `getFile(config, path): Promise<string>` — `GET /vault/{path}`
- Both throw typed errors on non-2xx; callers handle graceful fallback.

### Manifest Changes

- Add `host_permissions` entry: `"http://localhost:27123/*"` (hard-coded default; non-default ports require extension reload — same documented constraint as Ollama).
- If custom port is needed in future, that is a v1.1 concern.

### Security & Privacy

- API key lives only in `chrome.storage.local` — never sent to Ollama or any remote server.
- Markdown content fetched from Obsidian is passed in-memory to Ollama; never written back to storage.
- The Browse file list exposes vault filenames inside the popup UI only — not to page content scripts.
- Content scripts never receive the API key or raw document content; only the background processes Obsidian responses before forwarding sanitized data.

---

## 5. Risks & Roadmap

### Phased Rollout

**MVP (this PRD)**

- Obsidian connection config + test button in popup.
- Profile document selection → used for form auto-fill.
- System prompt document selection → used for side-panel chat.
- Graceful fallback to local storage when Obsidian unreachable.

**v1.1**

- Configurable Obsidian port stored and added to `host_permissions` dynamically (requires `declarativeNetRequest` or permission prompt on change).
- Browse UX: folder tree instead of flat list for large vaults.

**v2.0**

- Live reload: re-fetch profile/system prompt document if it changed since last use (compare `Last-Modified` header).

### Technical Risks

| Risk                                                               | Likelihood | Mitigation                                                                      |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------- |
| Obsidian REST API plugin not installed / running                   | High       | "Test connection" button with actionable error message pointing to plugin setup |
| CORS preflight rejected for non-default port                       | Medium     | All calls go through background worker; page origin never touches Obsidian      |
| Large vault file list (1000+ files) makes Browse dropdown unusable | Low        | Client-side fuzzy filter on the dropdown; pagination deferred to v1.1           |
| Raw markdown too large for Ollama context window                   | Low        | Warn in popup if document exceeds 8k characters; truncate with notice           |
| API key inadvertently logged                                       | Low        | Audit all `console.*` calls in background; strip key from error messages        |
