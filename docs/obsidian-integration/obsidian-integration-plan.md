# Plan: Obsidian Integration

**Generated**: 2026-04-17
**Estimated Complexity**: Medium

## Overview

Connect Fillix to the [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) community plugin so users can designate a vault document as their profile source and another as their system prompt. Both are configured once in popup/side-panel settings and resolved at runtime by the background service worker — keeping the same privacy model (all inference stays local).

Key architectural decision: `content.ts` does **not** change. The background `handle()` function transparently intercepts `OLLAMA_INFER` — if an Obsidian profile path is configured, it fetches the markdown and builds a markdown-aware prompt instead of the structured `UserProfile` prompt. The side panel does the same for the system prompt at send-time.

## Prerequisites

- Obsidian running with [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) installed and enabled.
- Plugin generates an API key visible in its settings panel.
- Default port: `27123`.

---

## Sprint 1: Foundation — Types, Storage, and Obsidian Client

**Goal**: All new data shapes, storage keys, and the thin Obsidian HTTP client exist and compile cleanly. Nothing is wired up yet.

**Demo/Validation**:

- `pnpm typecheck` passes with zero errors.
- Manual: import `getObsidianConfig` in browser console → returns default object.

### Task 1.1: Add `ObsidianConfig` to `src/types.ts`

- **Location**: `src/types.ts`
- **Description**: Add the interface and extend `Message` / `MessageResponse` discriminated unions.
- **Dependencies**: none
- **Changes**:
  ```typescript
  export interface ObsidianConfig {
    host: string; // default: "localhost"
    port: number; // default: 27123
    apiKey: string;
    profilePath?: string;
    systemPromptPath?: string;
  }
  ```
  Extend `Message`:
  ```typescript
  | { type: 'OBSIDIAN_LIST_FILES' }
  | { type: 'OBSIDIAN_GET_FILE'; path: string }
  | { type: 'OBSIDIAN_TEST_CONNECTION' }
  ```
  Extend `MessageResponse`:
  ```typescript
  | { ok: true; files: string[] }
  | { ok: true; content: string }
  ```
- **Acceptance Criteria**:
  - TypeScript exhaustiveness check in `background.ts` will flag the missing cases — that's expected and is fixed in Sprint 2.
  - No `any` introduced.
- **Validation**: `pnpm typecheck` (will fail until Sprint 2 adds background cases — acceptable mid-sprint).

### Task 1.2: Add storage helpers to `src/lib/storage.ts`

- **Location**: `src/lib/storage.ts`
- **Description**: Add `getObsidianConfig` / `setObsidianConfig` following the exact pattern of `getOllamaConfig` / `setOllamaConfig`.
- **Dependencies**: Task 1.1
- **Changes**:

  ```typescript
  const DEFAULT_OBSIDIAN: ObsidianConfig = {
    host: 'localhost',
    port: 27123,
    apiKey: '',
  };

  export async function getObsidianConfig(): Promise<ObsidianConfig> {
    const { obsidian } = await chrome.storage.local.get('obsidian');
    return { ...DEFAULT_OBSIDIAN, ...((obsidian as Partial<ObsidianConfig>) ?? {}) };
  }

  export async function setObsidianConfig(config: ObsidianConfig): Promise<void> {
    await chrome.storage.local.set({ obsidian: config });
  }
  ```

- **Acceptance Criteria**:
  - Reads from `obsidian` key, merges defaults.
  - API key is not stripped or transformed.
- **Validation**: `pnpm typecheck`.

### Task 1.3: Create `src/lib/obsidian.ts`

- **Location**: `src/lib/obsidian.ts` (new file)
- **Description**: Thin HTTP client mirroring the structure of `ollama.ts`. Three exported functions only — no business logic.
- **Dependencies**: Task 1.1
- **Implementation**:

  ```typescript
  import type { ObsidianConfig } from '../types';

  function baseUrl(config: ObsidianConfig): string {
    return `http://${config.host}:${config.port}`;
  }

  function headers(config: ObsidianConfig): Record<string, string> {
    return { Authorization: `Bearer ${config.apiKey}` };
  }

  export async function testConnection(config: ObsidianConfig): Promise<void> {
    const res = await fetch(`${baseUrl(config)}/`, { headers: headers(config) });
    if (!res.ok) throw new Error(`Obsidian API returned ${res.status}`);
  }

  export async function listFiles(config: ObsidianConfig): Promise<string[]> {
    const res = await fetch(`${baseUrl(config)}/vault/`, { headers: headers(config) });
    if (!res.ok) throw new Error(`Obsidian /vault/ returned ${res.status}`);
    const data = (await res.json()) as { files: string[] };
    return data.files.filter((f) => f.endsWith('.md'));
  }

  export async function getFile(config: ObsidianConfig, path: string): Promise<string> {
    const res = await fetch(`${baseUrl(config)}/vault/${encodeURIComponent(path)}`, {
      headers: { ...headers(config), Accept: 'text/markdown' },
    });
    if (!res.ok) throw new Error(`Obsidian /vault/${path} returned ${res.status}`);
    return res.text();
  }
  ```

- **Acceptance Criteria**:
  - Each function throws a typed `Error` on non-2xx — callers do fallback handling.
  - `listFiles` filters to `.md` files only.
  - No `any`.
- **Validation**: `pnpm typecheck`.

### Task 1.4: Add `host_permissions` to `manifest.config.ts`

- **Location**: `manifest.config.ts`
- **Description**: Add `http://localhost:27123/*` to `host_permissions`.
- **Dependencies**: none
- **Changes**: Append to the `host_permissions` array:
  ```typescript
  host_permissions: ['http://localhost:11434/*', 'http://localhost:27123/*'],
  ```
- **Acceptance Criteria**: `pnpm build` produces a `dist/manifest.json` with both localhost entries.
- **Validation**: Inspect `dist/manifest.json` after `pnpm build`.

---

## Sprint 2: Background Service Worker — Obsidian Message Handlers

**Goal**: The background can proxy Obsidian API calls and transparently inject Obsidian profile/system prompt into existing Ollama flows.

**Demo/Validation**:

- Open browser console in background service worker context.
- `await chrome.runtime.sendMessage({ type: 'OBSIDIAN_TEST_CONNECTION' })` → `{ ok: true }` (with Obsidian running) or `{ ok: false, error: '...' }`.
- `await chrome.runtime.sendMessage({ type: 'OBSIDIAN_LIST_FILES' })` → `{ ok: true, files: [...] }`.
- `pnpm typecheck` passes.

### Task 2.1: Add Obsidian message cases to `background.ts`

- **Location**: `src/background.ts`
- **Description**: Import Obsidian client and storage helper; add three new `case` branches to `handle()`.
- **Dependencies**: Sprint 1 complete
- **Changes**:
  Add imports:
  ```typescript
  import { getFile, listFiles, testConnection } from './lib/obsidian';
  import { getObsidianConfig, getOllamaConfig } from './lib/storage';
  ```
  Add cases inside `handle()` switch:
  ```typescript
  case 'OBSIDIAN_TEST_CONNECTION': {
    const obsidian = await getObsidianConfig();
    await testConnection(obsidian);
    return { ok: true };
  }
  case 'OBSIDIAN_LIST_FILES': {
    const obsidian = await getObsidianConfig();
    const files = await listFiles(obsidian);
    return { ok: true, files };
  }
  case 'OBSIDIAN_GET_FILE': {
    const obsidian = await getObsidianConfig();
    const content = await getFile(obsidian, msg.path);
    return { ok: true, content };
  }
  ```
- **Acceptance Criteria**:
  - TypeScript exhaustiveness check satisfied — `pnpm typecheck` passes.
  - Errors from the Obsidian client propagate as `{ ok: false, error: '...' }` via the existing catch in `onMessage.addListener`.
- **Validation**: `pnpm typecheck` + manual test via service worker console.

### Task 2.2: Update `OLLAMA_INFER` handler to support Obsidian profile

- **Location**: `src/background.ts`, `src/lib/ollama.ts`
- **Description**: When `ObsidianConfig.profilePath` is set, background fetches the markdown and passes it to Ollama instead of the `UserProfile` key-value map. `inferFieldValue` in `ollama.ts` gets an overloaded variant.
- **Dependencies**: Task 2.1
- **Changes in `src/lib/ollama.ts`**: Add `inferFieldValueFromMarkdown`:

  ```typescript
  export async function inferFieldValueFromMarkdown(
    config: OllamaConfig,
    field: FieldContext,
    profileMarkdown: string,
  ): Promise<string> {
    const res = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt: buildMarkdownPrompt(field, profileMarkdown),
        stream: false,
        format: 'json',
      }),
    });
    if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}`);
    const data = (await res.json()) as { response: string };
    try {
      const parsed = JSON.parse(data.response) as { value?: string };
      return parsed.value ?? '';
    } catch {
      return '';
    }
  }

  function buildMarkdownPrompt(field: FieldContext, profileMarkdown: string): string {
    return [
      'You are helping fill a web form.',
      "The following is the user's personal information document.",
      'Extract only the value relevant to the field described below.',
      'Respond with JSON only in the shape {"value": "<best value or empty string>"}.',
      'Return {"value": ""} if the information is not present. Do not invent data.',
      `Field: ${JSON.stringify(field)}`,
      `Personal information:\n${profileMarkdown}`,
    ].join('\n');
  }
  ```

- **Changes in `src/background.ts`** — update the `OLLAMA_INFER` case:
  ```typescript
  case 'OLLAMA_INFER': {
    const obsidianCfg = await getObsidianConfig();
    if (obsidianCfg.profilePath && obsidianCfg.apiKey) {
      try {
        const markdown = await getFile(obsidianCfg, obsidianCfg.profilePath);
        const value = await inferFieldValueFromMarkdown(config, msg.field, markdown);
        return { ok: true, value };
      } catch {
        // fall through to structured profile
      }
    }
    const value = await inferFieldValue(config, msg.field, msg.profile);
    return { ok: true, value };
  }
  ```
- **Acceptance Criteria**:
  - If Obsidian config has `profilePath` and `apiKey`, uses markdown path.
  - If Obsidian fetch fails for any reason, silently falls back to structured `UserProfile`.
  - `content.ts` requires zero changes.
- **Validation**: `pnpm typecheck`. End-to-end test in Sprint 4.

---

## Sprint 3: Popup UI — Obsidian Settings Section

**Goal**: Users can configure the Obsidian connection, test it, and pick profile/system prompt documents from inside the popup (options page).

**Demo/Validation**:

- Open the options page (`chrome://extensions` → Fillix → Extension options).
- Fill in API key → click "Test" → status shows "Connected ✓" or error.
- Click "Browse" next to Profile document → searchable dropdown of `.md` files appears.
- Select a file, Save → re-open popup → selection persists.
- Clear the path → profile form fields reappear.

### Task 3.1: Add Obsidian fieldset to `src/popup/index.html`

- **Location**: `src/popup/index.html`
- **Description**: Add a new `<fieldset id="obsidian-fieldset">` after the existing Ollama fieldset with: host (text), port (number), apiKey (password), test button + status, profilePath (text) + browse button, systemPromptPath (text) + browse button. Add a `<datalist id="vault-files">` for the browse dropdowns. Below the Obsidian fieldset, wrap existing profile fields in a `<div id="profile-form">` (for show/hide).
- **Dependencies**: none (pure HTML)
- **Acceptance Criteria**:
  - All new inputs have `id` or `data-` attributes for JS targeting.
  - `apiKey` input is `type="password"`.
  - `port` input is `type="number"` with `min="1"` `max="65535"`.
  - The `<datalist>` is empty by default and populated by JS.
- **Validation**: Visual inspection after `pnpm dev`.

### Task 3.2: Wire Obsidian settings in `src/popup/main.ts`

- **Location**: `src/popup/main.ts`
- **Description**: Load `ObsidianConfig` on init, save it with the existing save flow, wire the "Test" button, wire the "Browse" buttons, and show/hide the manual profile form.
- **Dependencies**: Task 3.1, Sprint 2
- **Key behaviors**:
  - `load()`: call `getObsidianConfig()`, populate the new inputs, call `toggleProfileForm()`.
  - `save()`: collect Obsidian fields, call `setObsidianConfig()` alongside existing saves.
  - Test button: send `OBSIDIAN_TEST_CONNECTION`, update a `#obsidian-status` span.
  - Browse buttons: send `OBSIDIAN_LIST_FILES`, populate `<datalist id="vault-files">` with returned paths, then programmatically open the associated input's suggestion list.
  - `toggleProfileForm(cfg: ObsidianConfig)`: if `cfg.profilePath` is non-empty, hide `#profile-form`; otherwise show it.
- **Acceptance Criteria**:
  - Saving with an empty `profilePath` shows the manual profile form.
  - Saving with a non-empty `profilePath` hides it.
  - Test button disables during in-flight request; re-enables after.
  - Browse button shows a loading state while fetching file list.
- **Validation**: Manual walkthrough in the options page.

---

## Sprint 4: Side Panel UI — Obsidian Settings + Runtime Integration

**Goal**: The side panel settings tab mirrors the Obsidian config (for convenience — it writes to the same storage key), and the chat uses the Obsidian system prompt document when configured.

**Demo/Validation**:

- Open side panel → Settings tab.
- Obsidian section visible with same fields as popup.
- Configure profilePath + systemPromptPath, save.
- Switch to Chat tab, send a message → background uses Obsidian system prompt.
- Fill a form on any page → background uses Obsidian profile doc.
- Stop Obsidian → form fill and chat still work (fallback), amber warning shows.

### Task 4.1: Add Obsidian section to `src/sidepanel/index.html`

- **Location**: `src/sidepanel/index.html`
- **Description**: Add Obsidian section inside `#settings-view` — same fields as popup (host, port, apiKey, test, profilePath + browse, systemPromptPath + browse). Wrap existing `[data-profile]` inputs in `<div id="profile-fields">`. Add `<div id="obsidian-status">` and `<div id="obsidian-warning" hidden>` (amber, for unreachable state).
- **Dependencies**: Sprint 3 HTML for reference
- **Acceptance Criteria**: All new elements have unique IDs. Style consistent with existing `.field-group` pattern.
- **Validation**: Visual inspection after `pnpm dev`.

### Task 4.2: Wire Obsidian settings in `src/sidepanel/main.ts`

- **Location**: `src/sidepanel/main.ts`
- **Description**: Load and save `ObsidianConfig`; wire test + browse buttons; toggle profile field visibility; fetch the system prompt document at send-time when `systemPromptPath` is configured.
- **Dependencies**: Task 4.1, Sprint 2
- **Key changes**:
  - Add `getObsidianConfig` / `setObsidianConfig` to the `load()` and `saveSettings` paths.
  - `doSend()`: before calling `controller.send()`, if `obsidianCfg.systemPromptPath && obsidianCfg.apiKey`, send `OBSIDIAN_GET_FILE` to background, use result as `systemPrompt`; if that fails, log warning, fall back to `latestChat.systemPrompt`, show `#obsidian-warning`.
  - `toggleProfileFields(cfg)`: hide `#profile-fields` when `cfg.profilePath` is non-empty.
  - Browse buttons: same `OBSIDIAN_LIST_FILES` → datalist pattern as popup.
- **Acceptance Criteria**:
  - System prompt from Obsidian is fetched fresh on every `doSend()` call (no caching).
  - Fetch failure never blocks chat — falls back silently + shows amber warning.
  - `#obsidian-warning` is hidden when Obsidian is reachable; shown on failure.
- **Validation**: Manual end-to-end: send a chat message with `systemPromptPath` set → verify in Ollama logs that the fetched document was used as the system prompt.

### Task 4.3: 8k character truncation guard

- **Location**: `src/lib/obsidian.ts` or `src/background.ts`
- **Description**: After fetching a document (either for profile or system prompt), if `content.length > 8000`, truncate to 8000 chars and append a comment: `\n\n[Document truncated at 8000 characters]`. No popup warning needed at this stage (v1.1 scope per PRD).
- **Dependencies**: Sprint 2
- **Acceptance Criteria**: Truncation happens in a single helper function used by both the `OLLAMA_INFER` Obsidian path (background.ts) and the `doSend()` Obsidian system prompt path (via `OBSIDIAN_GET_FILE` response).
- **Validation**: Unit test with a string of 9000 chars → verify output length ≤ 8001 (8000 + truncation notice).

---

## Sprint 5: Polish & Hardening

**Goal**: Error surfaces are clean, the API key never leaks into logs, and the extension behaves correctly across all failure modes.

**Demo/Validation**:

- Kill Obsidian mid-session → amber warning appears within 2s of next action; fill and chat continue working.
- Open popup with no `apiKey` configured → Browse buttons are disabled.
- Check background service worker logs → no API key visible.

### Task 5.1: Disable Browse buttons when no API key is present

- **Location**: `src/popup/main.ts`, `src/sidepanel/main.ts`
- **Description**: On load and on `apiKey` input events, toggle `disabled` on both Browse buttons when `apiKey.trim() === ''`.
- **Acceptance Criteria**: Browse buttons are always disabled when API key is empty. Test button is also disabled.
- **Validation**: Manual: load popup with empty stored config → buttons disabled.

### Task 5.2: Strip API key from error messages in background

- **Location**: `src/background.ts`
- **Description**: In the `onMessage.addListener` catch block, sanitize the error string — replace any occurrence of the stored API key with `[REDACTED]` before calling `sendResponse`.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: If Obsidian throws an error containing the key (e.g., in a URL), the key does not appear in the `MessageResponse.error` field.
- **Validation**: Unit test or manual inspection: set a recognizable fake key, trigger a 404 error from Obsidian, verify response error string does not contain the key.

### Task 5.3: "Obsidian unreachable" amber indicator persistence

- **Location**: `src/popup/main.ts`, `src/sidepanel/main.ts`
- **Description**: After a failed test connection or failed file fetch, set a `obsidianUnreachable` flag in module state. Display `#obsidian-warning` ("Obsidian unreachable — using local fallback") whenever this flag is true. Clear it on next successful test or successful file fetch.
- **Acceptance Criteria**: Warning appears within 2s of any Obsidian fetch failure. Warning disappears on next successful connection.
- **Validation**: Stop Obsidian → trigger an action → warning appears. Restart Obsidian → click Test → warning disappears.

---

## Testing Strategy

| Sprint | How to test                                                                   |
| ------ | ----------------------------------------------------------------------------- |
| 1      | `pnpm typecheck` — zero errors                                                |
| 2      | Service worker console: send each new message type manually                   |
| 3      | Options page UI walkthrough: connect, browse, save, reload                    |
| 4      | End-to-end: chat with Obsidian system prompt; fill form with Obsidian profile |
| 5      | Failure scenarios: kill Obsidian, empty API key, large document               |

**Regression checks after each sprint**:

- `pnpm typecheck`
- Existing form auto-fill still works (Ollama path unchanged)
- Existing chat still works (fallback system prompt)

---

## Potential Risks & Gotchas

### 1. `MessageResponse` union collision — `{ ok: true; files: string[] }` vs `{ ok: true; models: string[] }`

Both share `ok: true` with a different second key. TypeScript narrows these correctly with `'files' in response` vs `'models' in response`. Callers must use `in` checks, not index directly.

### 2. `OBSIDIAN_GET_FILE` path encoding

Vault paths with spaces or special characters must be `encodeURIComponent`-encoded. The `obsidian.ts` client already does this — but the `path` stored in config must be stored **unencoded** and only encoded at fetch time. Don't double-encode.

### 3. Side panel `doSend()` adds an async Obsidian fetch on the hot path

Fetching the system prompt document before every send adds latency (~50–200ms on localhost). This is acceptable per PRD (≤500ms SLA). If Obsidian fetch takes longer than 1s, it should time out and fall back — add an `AbortSignal` with a 1000ms timeout in a follow-up if users report lag.

### 4. `host_permissions` only covers `localhost:27123`

If a user changes the port, the extension silently fails (fetch blocked by Chrome). This matches the existing Ollama constraint and is documented in the PRD as a v1.1 item. Add a prominent note in the UI next to the port field: "Changing the port requires reloading the extension."

### 5. Browse UX: `<datalist>` vs custom dropdown

`<datalist>` is used for simplicity (no external dependencies). On Chrome it has quirks: the list doesn't always show immediately on programmatic focus. Test this specifically — if it's unreliable, replace with a `<select>` that becomes visible on Browse click.

### 6. Profile form hidden state and `save()` in popup

When the profile form is hidden, `[data-profile]` inputs still exist in the DOM. `save()` will still collect them (with empty values) and overwrite `chrome.storage` profile. When Obsidian mode is active, `save()` should skip collecting profile fields — or at minimum not overwrite a previously saved profile with empty values.

---

## Rollback Plan

All changes are additive to existing flows. To roll back:

1. Remove `ObsidianConfig` from `types.ts` and the three new `Message` / `MessageResponse` variants.
2. Remove `getObsidianConfig` / `setObsidianConfig` from `storage.ts`.
3. Delete `src/lib/obsidian.ts`.
4. Revert `background.ts` `OLLAMA_INFER` case to original.
5. Revert `manifest.config.ts` `host_permissions`.
6. Revert HTML/TS popup and side panel files.

The `obsidian` key in `chrome.storage.local` can remain — it won't be read by the reverted code.
