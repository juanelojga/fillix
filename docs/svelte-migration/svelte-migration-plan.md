# Plan: Svelte 5 + shadcn-svelte Sidepanel Migration

**Generated**: 2026-04-22
**Estimated Complexity**: High

## Overview

Migrate the Fillix sidepanel from ~1,200 lines of vanilla DOM TypeScript across 8 files to a Svelte 5 component tree with shadcn-svelte and Tailwind CSS 4. The `src/lib/` business logic layer (providers, tools, runners, storage) is untouched — only the presentation layer changes.

**Strategy**: Big-bang swap. The Svelte shell replaces all vanilla DOM code in Sprint 2. Settings and Agent tabs are stubbed immediately; Chat is implemented in Sprint 3; Settings and Agent in Sprints 4–5. There is no coexistence period between vanilla and Svelte.

## Prerequisites

- Node 24.14.0, pnpm 10.x
- Chrome developer mode enabled (for extension reload during testing)
- `pnpm build` is green on the base branch (record gzip sizes as baseline)
- `pnpm test` is green on the base branch

---

## Sprint 1: Build Infrastructure

**Goal**: Svelte 5 + Tailwind 4 + shadcn-svelte compile inside the `@crxjs/vite-plugin` pipeline. No user-visible change yet.

**Demo/Validation**:

- `pnpm build` exits 0 with zero Vite warnings about unresolved imports
- `pnpm typecheck` runs `svelte-check` followed by `tsc --noEmit` without errors
- `dist/` loads as a Chrome extension; the current vanilla sidepanel still works

### Task 1.1: Install dependencies

- **Location**: `package.json`
- **Description**: Install Svelte 5 and its Vite plugin, Tailwind 4 and its Vite plugin, shadcn-svelte peer deps, svelte-check, and testing libraries.
  ```
  pnpm add svelte@5 bits-ui clsx tailwind-merge
  pnpm add -D @sveltejs/vite-plugin-svelte tailwindcss@4 @tailwindcss/vite svelte-check @testing-library/svelte @testing-library/jest-dom
  ```
  Do **not** install `bits-ui` at a pinned version — let shadcn-svelte resolve the peer requirement in Task 1.5.
- **Dependencies**: none
- **Acceptance Criteria**:
  - `svelte`, `bits-ui`, `clsx`, `tailwind-merge` in `dependencies`
  - Dev packages in `devDependencies`
  - No peer-dependency warnings
- **Validation**: `pnpm install` exits 0; `node_modules/svelte` exists

### Task 1.2: Configure vite.config.ts

- **Location**: `vite.config.ts`
- **Description**: Add `svelte()` and `tailwindcss()` plugins **before** `crx()`. Add path aliases for the two namespaces used throughout the project.

  ```typescript
  import { defineConfig } from 'vite';
  import { crx } from '@crxjs/vite-plugin';
  import { svelte } from '@sveltejs/vite-plugin-svelte';
  import tailwindcss from '@tailwindcss/vite';
  import path from 'path';
  import manifest from './manifest.config';

  export default defineConfig({
    plugins: [svelte(), tailwindcss(), crx({ manifest })],
    resolve: {
      alias: {
        $lib: path.resolve('./src/lib'),
        $components: path.resolve('./src/sidepanel/components'),
      },
    },
    server: { port: 5173, strictPort: true, hmr: { port: 5174 } },
  });
  ```

  Plugin order is load-order-sensitive: `svelte()` and `tailwindcss()` must precede `crx()`.

- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Plugin array order: svelte → tailwindcss → crx
  - Both aliases resolve to existing directories (directories created in later tasks)
- **Validation**: `pnpm build` exits 0 (vanilla sidepanel still in place)

### Task 1.3: Update tsconfig.json for Svelte

- **Location**: `tsconfig.json`
- **Description**: Add `.svelte` files to the included set so `svelte-check` and editor tooling see them. The `svelte` type package provides `*.svelte` module declarations.
  ```json
  {
    "compilerOptions": {
      "types": ["svelte"]
    },
    "include": ["src/**/*.ts", "src/**/*.svelte"]
  }
  ```
  Preserve all existing `compilerOptions` (strict, noUnusedLocals, etc.).
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - `include` array contains both glob patterns
  - Strict mode and all existing compiler options unchanged
- **Validation**: `tsc --noEmit` still passes (no `.svelte` files exist yet, so no new errors)

### Task 1.4: Update `typecheck` script

- **Location**: `package.json`
- **Description**: Chain `svelte-check` (covers `.svelte` + `.ts`) with `tsc --noEmit` (covers `.ts` files outside Svelte's scope).
  ```json
  "typecheck": "svelte-check --tsconfig tsconfig.json && tsc --noEmit"
  ```
- **Dependencies**: Tasks 1.1, 1.3
- **Acceptance Criteria**:
  - `pnpm typecheck` runs both tools in sequence
- **Validation**: `pnpm typecheck` exits 0

### Task 1.5: Run shadcn-svelte init

- **Location**: `components.json`, `src/sidepanel/components/ui/`, `src/sidepanel/app.css`
- **Description**: Run the CLI interactively. Choose these options when prompted:
  - Style: Default
  - Base color: Slate
  - CSS variables: Yes
  - Components path: `src/sidepanel/components/ui`
  - Utils path: `src/sidepanel/components/utils.ts`
  - Tailwind CSS file: `src/sidepanel/app.css`

  ```
  npx shadcn-svelte@latest init
  ```

  After init, open `components.json` and verify all aliases reference `$components`, not `$lib`. If the CLI wrote `$lib/components/ui`, replace with `$components/ui`. Edit `src/sidepanel/components/utils.ts` if its import path references `$lib`.

- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - `components.json` at project root with correct paths
  - `src/sidepanel/app.css` contains `@import "tailwindcss"` and shadcn CSS variable block
  - `src/sidepanel/components/utils.ts` exists with `cn` helper
- **Validation**: `cat components.json` shows `$components`; `cat src/sidepanel/app.css` shows CSS vars

### Task 1.6: Add all required shadcn-svelte components

- **Location**: `src/sidepanel/components/ui/`
- **Description**: Install the full set of shadcn components needed across all three tabs in one command.
  ```
  npx shadcn-svelte@latest add button tabs textarea input select badge accordion separator tooltip scroll-area table
  ```
- **Dependencies**: Task 1.5
- **Acceptance Criteria**:
  - `src/sidepanel/components/ui/` contains a `.svelte` file for each added component
  - `pnpm build` exits 0
- **Validation**: `ls src/sidepanel/components/ui/` lists all expected files

### Task 1.7: Verify build pipeline end-to-end

- **Location**: terminal
- **Description**: Run `pnpm build` and confirm zero TypeScript errors and zero Vite import warnings. Load `dist/` in Chrome; the vanilla sidepanel must still open and function.
- **Dependencies**: Tasks 1.1–1.6
- **Acceptance Criteria**:
  - `pnpm build` exits 0
  - `pnpm typecheck` exits 0
  - Existing vanilla sidepanel loads normally in Chrome
- **Validation**: Chat with a message in the extension; verify streaming works before touching any sidepanel code

---

## Sprint 2: App Shell + Big-Bang Vanilla Deletion

**Goal**: `index.html` is a minimal Svelte mount point. `App.svelte` renders all three tabs (Settings and Agent stubbed). All 5 vanilla DOM sidepanel files deleted. Extension loads; tab navigation works.

**Demo/Validation**:

- Load `dist/` extension; sidepanel opens
- Three tabs are clickable; each shows stub content
- `src/sidepanel/agent.ts`, `settings.ts`, `obsidian-panel.ts`, `chat.ts`, `chat-tools.ts` no longer exist
- `pnpm build` and `pnpm typecheck` exit 0

### Task 2.1: Replace index.html with minimal Svelte shell

- **Location**: `src/sidepanel/index.html`
- **Description**: Replace the 859-line file with a minimal mount point. All HTML structure and inline CSS moves to Svelte components.
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Fillix</title>
    </head>
    <body>
      <div id="app"></div>
      <script type="module" src="./main.ts"></script>
    </body>
  </html>
  ```
- **Dependencies**: Sprint 1 complete
- **Acceptance Criteria**:
  - `index.html` is ≤ 15 lines
  - No inline `<style>` blocks; no hardcoded HTML structure
- **Validation**: `pnpm build` exits 0 (extension will show blank sidepanel until Task 2.2+)

### Task 2.2: Replace main.ts with Svelte mount

- **Location**: `src/sidepanel/main.ts`
- **Description**: Replace the 330-line orchestrator with a mount call.

  ```typescript
  import { mount } from 'svelte';
  import App from './App.svelte';
  import './app.css';

  mount(App, { target: document.getElementById('app')! });
  ```

- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - `main.ts` is ≤ 8 lines
  - `App.svelte` is the only import besides the CSS
- **Validation**: Extension loads; `App.svelte` is rendered

### Task 2.3: Create App.svelte with tab navigation and port context

- **Location**: `src/sidepanel/App.svelte`
- **Description**: Root component. Opens both chrome runtime ports in `onMount` and stores them in Svelte context so child tab components can read them. Uses shadcn `<Tabs>` for navigation.

  ```svelte
  <script lang="ts">
    import { onMount, setContext } from 'svelte';
    import { Tabs } from '$components/ui/tabs';
    import ChatTab from './tabs/ChatTab.svelte';
    import SettingsTab from './tabs/SettingsTab.svelte';
    import AgentTab from './tabs/AgentTab.svelte';

    onMount(() => {
      const chatPort = chrome.runtime.connect({ name: 'chat' });
      const agentPort = chrome.runtime.connect({ name: 'agent' });
      setContext('chatPort', chatPort);
      setContext('agentPort', agentPort);
      return () => { chatPort.disconnect(); agentPort.disconnect(); };
    });
  </script>

  <Tabs.Root defaultValue="chat" class="h-full flex flex-col">
    <Tabs.List>
      <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
      <Tabs.Trigger value="agent">Agent</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="chat" class="flex-1 overflow-hidden"><ChatTab /></Tabs.Content>
    <Tabs.Content value="settings"><SettingsTab /></Tabs.Content>
    <Tabs.Content value="agent"><AgentTab /></Tabs.Content>
  </Tabs.Root>
  ```

  Settings does not use a port — it calls `chrome.runtime.sendMessage` directly.

- **Dependencies**: Task 2.2, Task 1.6
- **Acceptance Criteria**:
  - Tab navigation renders correct stub content for each tab
  - Both ports stored in context via `setContext`
  - `onMount` cleanup disconnects both ports
- **Validation**: Load extension; click all three tabs; observe stub content

### Task 2.4: Create stub tab components

- **Location**:
  - `src/sidepanel/tabs/ChatTab.svelte`
  - `src/sidepanel/tabs/SettingsTab.svelte`
  - `src/sidepanel/tabs/AgentTab.svelte`
- **Description**: Minimal one-line stubs. ChatTab implemented fully in Sprint 3; Settings in Sprint 4; Agent in Sprint 5.
  ```svelte
  <!-- Each tab: -->
  <div class="p-4 text-muted-foreground">Coming soon</div>
  ```
- **Dependencies**: Task 2.3
- **Acceptance Criteria**:
  - Each component renders without TypeScript errors
  - Tab navigation works in Chrome
- **Validation**: Load extension; click each tab

### Task 2.5: Create store files

- **Location**:
  - `src/sidepanel/stores/chat.ts`
  - `src/sidepanel/stores/settings.ts`
  - `src/sidepanel/stores/agent.ts`
- **Description**: Stub writable stores establishing the typed contract. Full implementation in later sprints. Use `writable()` from `svelte/store` — runes (`$state`, `$derived`) are NOT available in plain `.ts` files.

  **chat.ts**:

  ```typescript
  import { writable } from 'svelte/store';
  import type { ChatMessage } from '../../types';

  export type StreamingState = 'idle' | 'streaming';

  export interface ActiveMessage {
    content: string;
    thinking: string;
    toolCalls: { toolName: string; args: Record<string, string>; result: string | null }[];
  }

  export const messages = writable<ChatMessage[]>([]);
  export const streamingState = writable<StreamingState>('idle');
  export const activeMessage = writable<ActiveMessage | null>(null);
  ```

  **settings.ts**:

  ```typescript
  import { writable } from 'svelte/store';
  import type { ProviderConfig, SearchConfig } from '../../types';

  export const providerConfig = writable<ProviderConfig | null>(null);
  export const searchConfig = writable<SearchConfig | null>(null);
  export const modelList = writable<string[]>([]);
  export const favoriteModels = writable<Record<string, string[]>>({});
  ```

  **agent.ts**:

  ```typescript
  import { writable } from 'svelte/store';
  import type { FieldFill, PipelineStage, WorkflowDefinition } from '../../types';

  export type StageStatus = 'idle' | 'running' | 'done' | 'error';

  export interface PipelineStageState {
    stage: PipelineStage;
    status: StageStatus;
    durationMs?: number;
    summary?: string;
    error?: string;
  }

  export const workflowList = writable<WorkflowDefinition[]>([]);
  export const pipelineStages = writable<PipelineStageState[]>([]);
  export const confirmFields = writable<FieldFill[]>([]);
  export const agentRunning = writable(false);
  ```

- **Dependencies**: Task 2.3
- **Acceptance Criteria**:
  - All three store files export typed writables
  - `pnpm typecheck` exits 0
- **Validation**: `pnpm typecheck` green

### Task 2.6: Delete all vanilla DOM sidepanel files

- **Location**: `src/sidepanel/`
- **Description**: Remove the five vanilla DOM modules. Keep `markdown.ts` — it has no DOM dependencies and is imported by `MessageBubble.svelte` in Sprint 3.
  ```
  rm src/sidepanel/agent.ts
  rm src/sidepanel/settings.ts
  rm src/sidepanel/obsidian-panel.ts
  rm src/sidepanel/chat.ts
  rm src/sidepanel/chat-tools.ts
  ```
- **Dependencies**: Tasks 2.3, 2.4, 2.5 (stub replacements exist)
- **Acceptance Criteria**:
  - Only `main.ts`, `App.svelte`, `app.css`, `index.html`, `markdown.ts`, `tabs/`, `stores/`, `components/` remain under `src/sidepanel/`
  - `pnpm build` exits 0 (no dangling imports from deleted files)
- **Validation**: `pnpm build` green; `ls src/sidepanel/` shows no vanilla `.ts` modules

---

## Sprint 3: Chat Tab

**Goal**: Chat tab is fully functional — streaming, tool calls, thinking blocks, new conversation, Send/Stop toggle.

**Demo/Validation**:

- Open sidepanel → Chat tab
- Type message, press Enter → user bubble appears; tokens stream into assistant bubble
- Mid-response tool call renders a collapsible block; result populates on resolution
- Thinking tokens appear in a distinct collapsible block
- Stop button halts streaming
- "New conversation" clears message list and resets store

### Task 3.1: Implement MessageBubble.svelte

- **Location**: `src/sidepanel/components/MessageBubble.svelte`
- **Description**: Renders a single chat message. Props: `role: 'user' | 'assistant' | 'error'`, `content: string`, `isStreaming?: boolean`.
  - User: right-aligned, accent background
  - Assistant: left-aligned, muted surface
  - While `isStreaming`, content renders as raw text (no markdown parse)
  - When done, `{@html renderMarkdown(content)}` (imports `renderMarkdown` from `../markdown.ts`)
  - `{@html}` is always wrapped in `DOMPurify.sanitize()` inside `renderMarkdown`
  - Default slot for child tool/thinking blocks
- **Dependencies**: none (standalone)
- **Acceptance Criteria**:
  - Correct alignment and background per role
  - Markdown renders only after streaming ends
  - No unsanitized `{@html}` usage
- **Validation**: Unit test (Sprint 6, Task 6.2); manual visual check

### Task 3.2: Implement ToolCallBlock.svelte

- **Location**: `src/sidepanel/components/ToolCallBlock.svelte`
- **Description**: Props: `toolName: string`, `args: Record<string, string>`, `result: string | null`.
  - Renders as `<details>` with `<summary>⚙ {toolName}: {primaryArg}`
  - Body shows args as key-value list
  - Result section appears only when `result !== null`
  - Initially collapsed
- **Dependencies**: none
- **Acceptance Criteria**:
  - No result → result section absent from DOM
  - With result → result section present
- **Validation**: Unit test (Sprint 6, Task 6.3)

### Task 3.3: Implement ThinkingBlock.svelte

- **Location**: `src/sidepanel/components/ThinkingBlock.svelte`
- **Description**: Props: `content: string`, `isStreaming?: boolean`.
  - Renders as `<details>` with distinct visual style (left border, muted text color)
  - Summary: "Thinking…" while `isStreaming`; "Thought process" when not
  - Content is raw text (no markdown)
- **Dependencies**: none
- **Acceptance Criteria**:
  - Visually distinct from `MessageBubble`
  - Summary text changes on `isStreaming` toggle
- **Validation**: Unit test (Sprint 6, Task 6.4)

### Task 3.4: Implement ChatTab.svelte with port bridge

- **Location**: `src/sidepanel/tabs/ChatTab.svelte`
- **Description**: Full chat tab. Reads `chatPort` from context (`getContext('chatPort')`). Wires port messages to stores. Renders message list and input controls.

  **Port message → store dispatch** (wired in `onMount`):
  - `token` → append to `activeMessage.content`
  - `thinking` → append to `activeMessage.thinking`
  - `tool-call` → push new entry to `activeMessage.toolCalls`
  - `tool-result` → find matching entry in `activeMessage.toolCalls` by `toolName`; set `result`
  - `done` → merge `activeMessage` into last item of `messages`; render markdown; clear `activeMessage`; set `streamingState: 'idle'`
  - `error` → push error bubble to `messages`; set `streamingState: 'idle'`

  **Send flow**:
  1. Push user `ChatMessage` to `messages`
  2. Set `activeMessage` to blank (content `''`, thinking `''`, toolCalls `[]`)
  3. Set `streamingState: 'streaming'`
  4. `port.postMessage({ type: 'CHAT_START', messages: $messages, systemPrompt, model })`

  **Input behavior**:
  - Textarea auto-expands up to 6 lines, then scrolls
  - `keydown`: Enter (no Shift) → send; Shift+Enter → newline
  - Send button hidden when `streamingState === 'streaming'`; Stop button shown instead
  - Stop: call `port.postMessage({ type: 'CHAT_STOP' })`; set `streamingState: 'idle'`

  **New conversation**: reset `messages` to `[]`; reset `activeMessage` to `null`; set `streamingState: 'idle'`

  **Auto-scroll**: `$effect` watches `$messages` and `$activeMessage`; calls `scrollIntoView` on the last message element ref.

- **Dependencies**: Tasks 3.1, 3.2, 3.3, Task 2.5
- **Acceptance Criteria**:
  - All US-01 acceptance criteria pass
  - No layout shifts during token streaming
  - Textarea grows/shrinks dynamically
  - Stop button halts stream
- **Validation**: Manual test: send message; observe stream; test Enter vs Shift+Enter; test Stop

---

## Sprint 4: Settings Tab

**Goal**: Settings tab fully functional — provider config loads and saves, model list refreshes and filters, Obsidian connection tested.

**Demo/Validation**:

- Switch to Settings; form fields populate from storage
- Change provider → baseUrl/apiKey fields show/hide reactively
- Refresh models → spinner; model list populates
- Pin a model → appears at top of list
- Save → "Saved ✓" badge for 2 s; reload extension; settings persist
- Obsidian: fill host + port → Test Connection → status badge

### Task 4.1: Implement stores/settings.ts fully

- **Location**: `src/sidepanel/stores/settings.ts`
- **Description**: Expand stub with async functions that call typed wrappers from `src/lib/storage.ts`.
  - `loadSettings()`: calls `getProviderConfig()`, `getSearchConfig()`, `getFavoriteModels()`, `getObsidianConfig()`; populates all stores
  - `saveSettings(config)`: writes provider config, search config, chat config to storage via setters
  - `refreshModels(liveConfig)`: sends `LIST_MODELS` message via `chrome.runtime.sendMessage`; updates `modelList`
  - `toggleFavorite(model, provider)`: reads current favorites, toggles entry, persists, updates `favoriteModels` store
  - `filterModels(query, allModels)`: pure function returning filtered string array (not a store — called on input event)
- **Dependencies**: Task 2.5
- **Acceptance Criteria**:
  - Zero direct `chrome.storage` calls — all via `src/lib/storage.ts` wrappers
  - `pnpm typecheck` exits 0
- **Validation**: `pnpm typecheck` green; manual: change a setting, reload extension, reopen settings

### Task 4.2: Implement SettingsTab.svelte

- **Location**: `src/sidepanel/tabs/SettingsTab.svelte`
- **Description**: Full implementation using shadcn `Input`, `Select`, `Button`, `Badge`, `Separator`. Calls `loadSettings()` on mount.

  **Sections in order**:
  1. Provider `<Select>` (ollama / openai / openrouter / custom)
  2. Base URL `<Input>` — hidden for openai and openrouter (fixed URLs)
  3. API Key `<Input type="password">` with show/hide toggle — hidden for ollama
  4. Model search `<Input>` with 200 ms debounce → calls `filterModels`
  5. Model `<Select>` populated from filtered model list; favorites shown first via `<optgroup>` equivalent
  6. Refresh models `<Button>` (spinner during fetch) + Pin model `<Button>`
  7. System prompt `<Textarea>`
  8. Brave Search API key `<Input type="password">` with show/hide toggle
  9. `<ObsidianPanel />` (Task 4.3)
  10. Save `<Button>` → calls `saveSettings()`; shows `<Badge>` "Saved ✓" for 2 s on success, error text on failure

  **Field visibility** is driven by a `$derived` or reactive `$effect` on the selected provider value.

- **Dependencies**: Tasks 4.1, 4.3
- **Acceptance Criteria**:
  - All US-02 acceptance criteria pass
  - Debounce is exactly 200 ms (use `setTimeout`/`clearTimeout` pattern in the event handler)
  - No direct storage calls in the component — all via store functions
- **Validation**: Manual: cycle through all four providers; verify field visibility each time

### Task 4.3: Implement ObsidianPanel.svelte

- **Location**: `src/sidepanel/components/ObsidianPanel.svelte`
- **Description**: Obsidian config grouped inside a shadcn `<Accordion>`. No props — reads from and writes to storage directly via `loadSidepanelObsidian` / `saveSidepanelObsidian` helpers (implement inline or in settings store).

  **Fields**:
  - Host `<Input>`
  - Port `<Input type="number">`
  - API Key `<Input type="password">`
  - **Test Connection** `<Button>`: disabled when host or port is empty; on click, sends `OBSIDIAN_TEST_CONNECTION` via `chrome.runtime.sendMessage`; shows `<Badge variant="success">` or `<Badge variant="destructive">` based on result
  - System Prompt Path `<Input>` with **Browse** `<Button>`: sends `OBSIDIAN_LIST_FILES` message; populates a `<datalist>` for autocomplete; updates input value on selection

- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - All US-05 acceptance criteria pass
  - Test button disabled when host or port fields are empty (reactive)
- **Validation**: Manual: fill host + port → button enables; click Test; observe badge

---

## Sprint 5: Agent Tab

**Goal**: Agent tab fully functional — workflow runs, pipeline stages update live, confirm table is editable, Apply/Cancel work.

**Demo/Validation**:

- Open Agent tab; workflow list populates
- Select workflow → click Run → pipeline stage indicators advance
- Confirm table appears with editable proposed values
- Edit a value; click Apply → fields written to page
- Click Cancel → confirm table clears

### Task 5.1: Implement stores/agent.ts fully

- **Location**: `src/sidepanel/stores/agent.ts`
- **Description**: Expand stub with functions that match the `AGENTIC_*` message protocol from `src/background.ts`.
  - `loadWorkflows()`: sends `LIST_WORKFLOWS`; updates `workflowList`
  - `startRun(workflowId, tabId, port)`: posts `AGENTIC_RUN` to `agentPort`; sets `agentRunning: true`; resets `pipelineStages` to 5 idle entries
  - `handleStageUpdate(msg)`: updates the matching stage in `pipelineStages` on `AGENTIC_STAGE`
  - `handleConfirm(fields)`: sets `confirmFields` on `AGENTIC_CONFIRM`
  - `applyFields(editedFills, logEntryId, port)`: posts `AGENTIC_APPLY`; clears `confirmFields`; sets `agentRunning: false`
  - `cancelRun()`: clears `confirmFields`; resets `pipelineStages`; sets `agentRunning: false`
- **Dependencies**: Task 2.5
- **Acceptance Criteria**:
  - `FieldFill.editedValue` is preserved through table edits
  - All store functions match the message protocol in `src/types.ts` exactly
  - `pnpm typecheck` exits 0
- **Validation**: `pnpm typecheck` green

### Task 5.2: Implement PipelineStages.svelte

- **Location**: `src/sidepanel/components/PipelineStages.svelte`
- **Description**: Props: `stages: PipelineStageState[]`. Renders 5 stage items in fixed order: collect → understand → plan → draft → review.
  - **idle**: muted icon + stage name
  - **running**: spinner + stage name + "(running…)"
  - **done**: check icon + stage name + duration (e.g. "3.2 s")
  - **error**: ✕ icon + stage name + `error` string inline (not a global alert)
  - Uses `<Badge>` for status labels
- **Dependencies**: Task 2.5 (store types)
- **Acceptance Criteria**:
  - All 5 stages render regardless of `stages` prop length (show idle for missing entries)
  - Error string appears inline with the failed stage
- **Validation**: Unit test (Sprint 6, Task 6.5)

### Task 5.3: Implement ConfirmTable.svelte

- **Location**: `src/sidepanel/components/ConfirmTable.svelte`
- **Description**: Props: `fields: FieldFill[]` (bindable). Uses shadcn `<Table>`. Columns: Field Name | Current Value | Proposed Value (editable).
  - Each proposed value cell: `<Input bind:value={field.editedValue} />`
  - `editedValue` initializes to `proposedValue` if undefined
  - Edits update the parent's `fields` array via the binding
- **Dependencies**: none
- **Acceptance Criteria**:
  - One row per `FieldFill` entry
  - Editing an input updates `field.editedValue` in the parent
- **Validation**: Unit test (Sprint 6, Task 6.6)

### Task 5.4: Implement AgentTab.svelte with port bridge

- **Location**: `src/sidepanel/tabs/AgentTab.svelte`
- **Description**: Full agent tab. Reads `agentPort` from context. Wires port messages to store functions. Renders workflow selector, pipeline stages, and confirm UI.

  **Port bridge** (wired in `onMount`):
  - `AGENTIC_STAGE` → `handleStageUpdate(msg)`
  - `AGENTIC_CONFIRM` → `handleConfirm(msg.proposed)`; store `msg.logEntryId` in component state
  - `AGENTIC_COMPLETE` → set `agentRunning: false`; show completion message
  - `AGENTIC_ERROR` → `handleStageUpdate` with error status

  **Layout**:
  1. Workflow `<Select>` + Refresh `<Button>` + Run `<Button>`
  2. `<PipelineStages stages={$pipelineStages} />` — visible when `$agentRunning` or stages have data
  3. `<ConfirmTable bind:fields={$confirmFields} />` — rendered only when `$confirmFields.length > 0`
  4. Apply `<Button>` (primary, full-width) + Cancel `<Button>` (ghost, full-width) — shown only when confirming

  **Run flow**: get active tab via `chrome.tabs.query({ active: true, currentWindow: true })`; call `startRun(workflowId, tabId, port)`.

- **Dependencies**: Tasks 5.1, 5.2, 5.3, Task 2.3
- **Acceptance Criteria**:
  - All US-03 acceptance criteria pass
  - Apply and Cancel are full-width and visually distinct
  - Error state inline with failed stage
- **Validation**: Manual end-to-end: run workflow; confirm; apply to a test form page

---

## Sprint 6: Component Tests

**Goal**: ≥ 80% of Svelte components have a `.spec.ts`. `pnpm test` exits 0.

**Demo/Validation**:

- `pnpm test` exits 0
- Test output shows ≥ 8 test files

### Task 6.1: Configure vitest for Svelte component testing

- **Location**: `vite.config.ts` (or `vitest.config.ts` if split)
- **Description**: Add a `test` block that sets JSDOM environment, registers setup file, and includes sidepanel specs.
  ```typescript
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
  }
  ```
  Create `src/test-setup.ts`:
  ```typescript
  import '@testing-library/jest-dom/vitest';
  ```
- **Dependencies**: Task 1.1 (packages installed)
- **Acceptance Criteria**:
  - `pnpm test` discovers `.spec.ts` files in `src/sidepanel/`
  - `@testing-library/jest-dom` matchers available (e.g. `toBeInTheDocument`, `toHaveTextContent`)
- **Validation**: `pnpm test` exits 0 with setup file only (no test files yet)

### Task 6.2: Write tests for MessageBubble.svelte

- **Location**: `src/sidepanel/components/MessageBubble.spec.ts`
- **Description**: Test role-based rendering, markdown output on non-streaming content, raw text while streaming.
- **Acceptance Criteria**:
  - User bubble has alignment class; assistant bubble does not
  - `isStreaming: false` → markdown rendered; `isStreaming: true` → raw text
- **Validation**: `pnpm test -- MessageBubble` passes

### Task 6.3: Write tests for ToolCallBlock.svelte

- **Location**: `src/sidepanel/components/ToolCallBlock.spec.ts`
- **Acceptance Criteria**:
  - `result: null` → result section absent from DOM
  - `result: 'some text'` → result section present
- **Validation**: `pnpm test -- ToolCallBlock` passes

### Task 6.4: Write tests for ThinkingBlock.svelte

- **Location**: `src/sidepanel/components/ThinkingBlock.spec.ts`
- **Acceptance Criteria**:
  - `isStreaming: true` → summary contains "Thinking"
  - `isStreaming: false` → summary contains "Thought process"
- **Validation**: `pnpm test -- ThinkingBlock` passes

### Task 6.5: Write tests for PipelineStages.svelte

- **Location**: `src/sidepanel/components/PipelineStages.spec.ts`
- **Acceptance Criteria**:
  - All 5 stage names render
  - Stage with `status: 'running'` shows spinner indicator
  - Stage with `status: 'error'` shows error text
- **Validation**: `pnpm test -- PipelineStages` passes

### Task 6.6: Write tests for ConfirmTable.svelte

- **Location**: `src/sidepanel/components/ConfirmTable.spec.ts`
- **Acceptance Criteria**:
  - Renders one row per `FieldFill` entry
  - Changing the proposed value input updates `field.editedValue`
- **Validation**: `pnpm test -- ConfirmTable` passes

### Task 6.7: Write smoke tests for the three tab components

- **Location**:
  - `src/sidepanel/tabs/ChatTab.spec.ts`
  - `src/sidepanel/tabs/SettingsTab.spec.ts`
  - `src/sidepanel/tabs/AgentTab.spec.ts`
- **Description**: Shallow smoke tests only — mock `chrome.runtime.connect` and `chrome.runtime.sendMessage`; verify tab renders without errors; key controls are present in the DOM.
  - ChatTab: Send button and textarea present
  - SettingsTab: Save button and provider select present
  - AgentTab: Run button and workflow select present
- **Dependencies**: Tasks 6.1–6.6
- **Acceptance Criteria**:
  - Each tab renders without throwing; key controls found by accessible role/label
- **Validation**: `pnpm test` full suite green; coverage ≥ 80% of component files

---

## Sprint 7: Polish & Accessibility

**Goal**: Lighthouse Accessibility ≥ 95; dark mode verified across all surfaces; micro-interactions added; bundle delta ≤ 15 KB gzip.

**Demo/Validation**:

- Lighthouse on loaded extension sidepanel: Accessibility score ≥ 95
- DevTools → Emulate `prefers-color-scheme: dark` → all surfaces invert without artifacts
- `pnpm build` gzip delta report ≤ 15 KB vs baseline from Sprint 1

### Task 7.1: Audit and fix dark mode across all surfaces

- **Location**: All `.svelte` files + `src/sidepanel/app.css`
- **Description**: Review every color value in component `<style>` blocks. All colors must use shadcn-svelte CSS variables (`--background`, `--foreground`, `--muted`, `--accent`, etc.) or Tailwind semantic utilities. No hardcoded hex, rgb, or hsl values outside `app.css`. In DevTools, emulate dark scheme and check for any light-mode artifacts.
- **Acceptance Criteria**:
  - Zero hardcoded color values in component `<style>` blocks
  - All surfaces invert correctly in dark mode emulation
  - Contrast ratio ≥ 4.5:1 on all body text (WCAG AA)
- **Validation**: Visual check in Chrome DevTools → Rendering → Emulate CSS media feature `prefers-color-scheme: dark`

### Task 7.2: Run Lighthouse accessibility audit and fix violations

- **Location**: All `.svelte` files
- **Description**: Run Lighthouse on the loaded extension sidepanel (open sidepanel → DevTools → Lighthouse → Accessibility). Address every violation:
  - All form inputs have associated `<label>` or `aria-label`
  - All interactive elements have accessible names
  - Focus order is logical (tab through all controls)
- **Acceptance Criteria**:
  - Lighthouse Accessibility score ≥ 95
- **Validation**: Lighthouse report; screenshot score

### Task 7.3: Add Tooltip to icon-only buttons

- **Location**: `src/sidepanel/tabs/SettingsTab.svelte`, `src/sidepanel/tabs/AgentTab.svelte`
- **Description**: Wrap Refresh and Pin icon buttons with shadcn `<Tooltip>`. Each button must also have an `aria-label` matching the tooltip text.
  - Settings: "Refresh models", "Pin model", show/hide toggles on API key fields
  - Agent: "Refresh workflows"
- **Acceptance Criteria**:
  - Tooltip appears on hover and keyboard focus
  - `aria-label` set on each icon-only button
- **Validation**: Manual: hover each icon button; observe tooltip

### Task 7.4: Add message bubble enter transition

- **Location**: `src/sidepanel/components/MessageBubble.svelte`
- **Description**: Import `fly` from `svelte/transition`. Apply `transition:fly={{ y: 8, duration: 150 }}` to the bubble wrapper element. The transition fires only on mount (new message), not on every token update — ensure the animated element is the bubble wrapper, not the text content node.
- **Acceptance Criteria**:
  - New messages slide up on appear
  - No layout shift during token streaming (animation only on mount)
- **Validation**: Manual: send a message; observe slide-in animation; verify no jitter during streaming

### Task 7.5: Replace message list overflow with ScrollArea

- **Location**: `src/sidepanel/tabs/ChatTab.svelte`
- **Description**: Wrap the message list container with shadcn `<ScrollArea>`. Maintain auto-scroll-to-bottom by using a `$effect` that watches `$messages` and `$activeMessage`; calls `el.scrollIntoView({ block: 'end' })` on a sentinel `<div>` at the bottom of the list.
- **Acceptance Criteria**:
  - Message list scrolls with shadcn custom scrollbar
  - New messages auto-scroll to bottom
  - User can scroll up to read history without being snapped back while streaming
- **Validation**: Manual: fill list; scroll up; send new message (should not snap during streaming; should scroll after done)

### Task 7.6: Final bundle size check

- **Location**: `dist/` output
- **Description**: Run `pnpm build` with verbose output. Compare gzipped sidepanel JS against the pre-migration baseline recorded in Sprint 1. If delta exceeds 15 KB: audit `dist/` for any unused shadcn components (each is a separate file and should tree-shake); remove any added in Task 1.6 that are not actually imported.
- **Acceptance Criteria**:
  - Gzipped sidepanel JS delta ≤ 15 KB vs pre-migration baseline
- **Validation**: `pnpm build --reporter=verbose`; compare output sizes

---

## Testing Strategy

| Sprint | Test method                                                                            |
| ------ | -------------------------------------------------------------------------------------- |
| 1      | `pnpm build` exit 0; `pnpm typecheck` exit 0; extension loads with vanilla sidepanel   |
| 2      | Load extension in Chrome; three tabs navigate with stub content; `pnpm build` green    |
| 3      | Manual: stream a message, tool call, thinking block, new conversation                  |
| 4      | Manual: cycle providers; save settings; persist after reload; test Obsidian connection |
| 5      | Manual: full agent workflow end-to-end on a test form page                             |
| 6      | `pnpm test` full suite green; ≥ 80% component coverage                                 |
| 7      | Lighthouse ≥ 95; dark mode visual check; bundle size report                            |

---

## Potential Risks & Gotchas

1. **Plugin order in vite.config.ts** — `svelte()` must precede `crx()`. Reversed order silently breaks `.svelte` HMR and may produce incorrect output chunks.

2. **Runes not available in plain `.ts` files** — `$state`, `$derived`, `$effect` work only in `.svelte` and `.svelte.ts` files. The stores in `stores/*.ts` must use `writable()` from `svelte/store`. Do not attempt runes in plain `.ts`.

3. **`$lib` alias conflict** — shadcn-svelte CLI defaults to `$lib → src/lib/`. After `init`, verify `components.json` uses `$components`. If generated component files import from `$lib/utils`, edit them to import from `$components/utils`.

4. **Tailwind v4 has no tailwind.config.js** — Configuration is purely CSS-based (`@theme` directives in `app.css`). Any documentation or examples referencing `tailwind.config.js` apply to v3 only.

5. **`bits-ui` version** — shadcn-svelte has hard peer requirements on `bits-ui`. Let the shadcn CLI resolve the version during `init` (Task 1.5) rather than installing `bits-ui` manually first. If installed manually, remove it and re-run init.

6. **Settings tab uses `sendMessage`, not ports** — Do not open a port in `SettingsTab.svelte`. Settings uses `chrome.runtime.sendMessage` for one-off requests (`LIST_MODELS`, `OBSIDIAN_TEST_CONNECTION`, `OBSIDIAN_LIST_FILES`).

7. **ConfirmTable binding in Svelte 5** — `bind:fields` requires the parent to hold `fields` as a reactive reference. If `confirmFields` is a Svelte `writable`, use `let fields = $confirmFields` with `$effect` to write back, or pass a callback prop instead. Do not mix store subscriptions and `bind:` on the same value.

8. **`svelte-check` + `tsc` duplicate errors** — If both report the same TypeScript error, prefer running `svelte-check` alone (it covers `.ts` files too). The chained script in `typecheck` may need to be simplified to just `svelte-check --tsconfig tsconfig.json` if duplicates become noisy.

9. **`markdown.ts` import path** — `src/sidepanel/markdown.ts` is imported by relative path in component files (`../markdown.ts` from `src/sidepanel/components/`). Do not move or re-export it through a different path.

10. **Auto-scroll during streaming** — The `$effect` watching messages must not trigger a scroll-to-bottom while the user has manually scrolled up. Implement a `userScrolled` flag: set it to `true` on scroll events; reset to `false` only on "New conversation". Only auto-scroll when `!userScrolled`.

---

## Rollback Plan

- All deleted vanilla DOM code exists in git history. Rollback: `git revert` the Sprint 2 deletion commit.
- The `src/lib/` layer is untouched throughout — any rollback only affects `src/sidepanel/`.
- Before Sprint 2 begins, tag the last-known-good commit (`git tag pre-svelte-migration`) to give a clean revert target without bisecting history.
