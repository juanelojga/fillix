# Plan: Agentic Filler — Fillix v2 MVP

**Generated**: 2026-04-20  
**Estimated Complexity**: High  
**PRD Reference**: `docs/prd-agentic-filler.md`

---

## Overview

Introduce an **Agentic Filler** that runs a 5-stage Ollama pipeline (Understand → Collect → Plan → Draft → Review) against the current page, streams live progress to a new "Agent" tab in the side panel, and shows a confirm diff table before writing anything to the page. Workflow definitions are Obsidian markdown files with YAML frontmatter; execution logs are appended back to the vault.

**Key design choices:**

- Side panel opens a port named `'agent'` to background (mirrors existing `'chat'` port pattern)
- Background orchestrates the full pipeline and forwards field detection/application to the active-tab content script via `chrome.tabs.sendMessage`
- All Ollama stage calls use a new `generateStructured<T>()` function in `ollama.ts` that adds `system` + `format: 'json'` to the existing `/api/generate` pattern
- Workflow YAML is parsed in background using `js-yaml`

---

## Prerequisites

- `pnpm install` working; extension loads in Chrome
- Obsidian Local REST API plugin installed and running (existing requirement)
- At least one Ollama model with structured JSON output support (e.g., `gemma3:4b`)
- `OLLAMA_ORIGINS=chrome-extension://*` set in Ollama environment

---

## Sprint 1: Foundation — Types, Storage, Dependencies

**Goal**: Add all shared types and storage keys. Every subsequent sprint imports from this foundation. No runtime behavior changes yet.

**Demo/Validation**:

- `pnpm typecheck` passes with zero errors
- `pnpm build` produces a valid extension bundle

---

### Task 1.1: Install js-yaml

- **Location**: `package.json`, `pnpm-lock.yaml`
- **Description**: Add `js-yaml` as a runtime dependency and `@types/js-yaml` as a dev dependency. This is the only new runtime dep in the MVP.
- **Dependencies**: None
- **Acceptance Criteria**:
  - `pnpm add js-yaml && pnpm add -D @types/js-yaml` succeeds
  - `import { load } from 'js-yaml'` compiles without errors in a test file
- **Validation**: `pnpm typecheck`

---

### Task 1.2: Add agentic types to `types.ts`

- **Location**: `src/types.ts`
- **Description**: Extend the type file with all new shared types. Do **not** modify `Message` or `MessageResponse` yet (those depend on knowing the full message set — done in Sprint 2/3).

  Add these types:

  ```typescript
  // Serializable field snapshot (no DOM refs — safe to send via messages)
  export interface FieldSnapshot {
    id?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    type?: string;
    autocomplete?: string;
    currentValue: string;
  }

  // A proposed fill: field identifier + new value
  export interface FieldFill {
    fieldId: string; // matches FieldSnapshot.id or FieldSnapshot.name
    label: string;
    currentValue: string;
    proposedValue: string;
    editedValue?: string; // set if user edits inline before Apply
  }

  // Pipeline stage identifiers
  export type PipelineStage = 'understand' | 'collect' | 'plan' | 'draft' | 'review';

  // Workflow definition (parsed from Obsidian frontmatter + body)
  export interface WorkflowDefinition {
    id: string; // vault path (e.g., "workflows/job-application.md")
    name: string;
    taskType: 'form' | 'field-by-field' | 'linkedin-post' | 'rewrite';
    tone: string;
    requiredProfileFields: string[];
    review: boolean;
    logFullOutput: boolean;
    autoApply: boolean;
    systemPrompt: string; // markdown body (below the frontmatter)
  }

  // Stage output shapes — used by pipeline orchestrator
  export interface UnderstandOutput {
    task_type: string;
    detected_fields: string[];
    confidence: number;
  }

  export interface PlanOutput {
    fields_to_fill: Array<{ field_id: string; strategy: string }>;
    missing_fields: string[];
    tone: string;
    notes: string;
  }

  export interface DraftOutput {
    [fieldId: string]: string;
  }

  export interface ReviewOutput {
    [fieldId: string]: { revised_value: string; change_reason?: string };
  }
  ```

- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - All types exported from `src/types.ts`
  - No `any` used
- **Validation**: `pnpm typecheck`

---

### Task 1.3: Extend `storage.ts` with agentic keys

- **Location**: `src/lib/storage.ts`
- **Description**: Add three new storage operations:

  ```typescript
  // Cached list of discovered workflows (refreshed by background)
  export async function getWorkflows(): Promise<WorkflowDefinition[]>;
  export async function setWorkflows(workflows: WorkflowDefinition[]): Promise<void>;

  // User-configured vault subfolder to scan for workflow .md files
  export async function getWorkflowsFolder(): Promise<string>; // default: "fillix-workflows"
  export async function setWorkflowsFolder(folder: string): Promise<void>;
  ```

  Import `WorkflowDefinition` from `../types`.

- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Functions are strongly typed (no `any`)
  - `getWorkflowsFolder()` returns `"fillix-workflows"` if unset
- **Validation**: `pnpm typecheck`

---

## Sprint 2: Obsidian Write + Workflow Discovery

**Goal**: Background can discover and parse workflow files from the vault; it can also append log entries. No pipeline or UI yet.

**Demo/Validation**:

- Load extension, open background service worker console
- Run `chrome.runtime.sendMessage({ type: 'WORKFLOWS_REFRESH' })` — workflows array populates in storage
- Open DevTools → Application → chrome.storage.local → confirm `workflows` key is populated
- Manually trigger `chrome.runtime.sendMessage({ type: 'OBSIDIAN_WRITE', path: 'test.md', content: '# test' })` — file appears in vault

---

### Task 2.1: Add `writeFile()` to `obsidian.ts`

- **Location**: `src/lib/obsidian.ts`
- **Description**: Add a write function using Obsidian Local REST API's `PUT /vault/{path}`:

  ```typescript
  export async function writeFile(
    config: ObsidianConfig,
    path: string,
    content: string,
  ): Promise<void>;
  ```

  Use `Content-Type: text/markdown` and send `content` as the request body. If the file does not exist, the Obsidian REST API creates it automatically on PUT.

  Also add an `appendToFile()` helper that reads the current content then writes `currentContent + '\n\n' + newContent`. This is used by log writes.

- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - `writeFile` and `appendToFile` exported
  - Uses same `headers()` and `baseUrl()` helpers as existing functions
  - 5-second timeout via `AbortSignal.timeout`
  - Throws on non-2xx response
- **Validation**: `pnpm typecheck`; manual test via background console

---

### Task 2.2: Add `OBSIDIAN_WRITE` message + background handler

- **Location**: `src/types.ts`, `src/background.ts`
- **Description**:

  Add to `Message`:

  ```typescript
  | { type: 'OBSIDIAN_WRITE'; path: string; content: string }
  | { type: 'OBSIDIAN_APPEND'; path: string; content: string }
  ```

  Both respond with `{ ok: true }` or `{ ok: false; error: string }`.

  Add cases in `background.ts`'s `handle()` function. Both read ObsidianConfig, call `writeFile` or `appendToFile` respectively.

- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - TypeScript exhaustiveness check in `handle()` still passes
  - `OBSIDIAN_WRITE` and `OBSIDIAN_APPEND` work end-to-end
- **Validation**: `pnpm typecheck`; manual test via DevTools console

---

### Task 2.3: Create `src/lib/workflow.ts` — frontmatter parser

- **Location**: `src/lib/workflow.ts` (new file)
- **Description**: Create a module that parses a raw markdown string into a `WorkflowDefinition`:

  ```typescript
  import { load } from 'js-yaml';
  import type { WorkflowDefinition } from '../types';

  export function parseWorkflow(vaultPath: string, raw: string): WorkflowDefinition;
  ```

  - Split on `---` to extract frontmatter and body
  - Parse frontmatter with `js-yaml`'s `load()`
  - Validate that `name` field is present (throw with path in error if missing)
  - Apply defaults: `taskType: 'form'`, `tone: 'professional'`, `review: true`, `logFullOutput: true`, `autoApply: false`, `requiredProfileFields: []`
  - Map camelCase fields from snake_case YAML keys (`task_type` → `taskType`, etc.)
  - `systemPrompt` is the markdown body (trimmed)

- **Dependencies**: Task 1.1, Task 1.2
- **Acceptance Criteria**:
  - Throws a descriptive error if `name` is missing
  - Returns valid `WorkflowDefinition` for the minimal valid example from the PRD
  - Defaults are correctly applied when optional fields are absent
- **Validation**: `pnpm typecheck`; manual unit test in console

---

### Task 2.4: Add `WORKFLOWS_REFRESH` + `WORKFLOWS_LIST` messages + background handler

- **Location**: `src/types.ts`, `src/background.ts`
- **Description**:

  Add to `Message`:

  ```typescript
  | { type: 'WORKFLOWS_REFRESH' }
  | { type: 'WORKFLOWS_LIST' }
  ```

  Add to `MessageResponse`:

  ```typescript
  | { ok: true; workflows: WorkflowDefinition[] }
  ```

  `WORKFLOWS_REFRESH` handler in `background.ts`:
  1. Get `ObsidianConfig` and `workflowsFolder` from storage
  2. Call `listFiles(config)` — filter to files starting with `workflowsFolder + '/'`
  3. For each file, call `getFile(config, path)` and `parseWorkflow(path, content)`
  4. Collect successes; log parse failures to console (don't abort)
  5. `setWorkflows(results)` to storage
  6. Return `{ ok: true }`

  `WORKFLOWS_LIST` handler: reads from storage, returns `{ ok: true, workflows }`.

- **Dependencies**: Task 2.3, Task 1.3
- **Acceptance Criteria**:
  - `WORKFLOWS_REFRESH` populates `chrome.storage.local` workflows key
  - Invalid workflow files are skipped with a console warning, not a hard failure
  - TypeScript exhaustiveness check still passes
- **Validation**: `pnpm typecheck`; DevTools console test

---

## Sprint 3: Content Script — Field Snapshot & Apply

**Goal**: Content script can return a serializable list of fillable fields and can apply a set of values on command. Background proxies both operations to the active tab.

**Demo/Validation**:

- On any form page, open background console and run `chrome.tabs.query({active:true,currentWindow:true}, ([t]) => chrome.tabs.sendMessage(t.id, {type:'DETECT_FIELDS'}, r => console.log(r)))`
- Verify FieldSnapshot[] logs with labels, types, current values
- Send `APPLY_FIELDS` with a test value — verify the field updates on page

---

### Task 3.1: Add `DETECT_FIELDS` handler to `content.ts`

- **Location**: `src/content.ts`, `src/lib/forms.ts`
- **Description**:

  Add a new exported function to `forms.ts`:

  ```typescript
  export function snapshotFields(root?: Document): FieldSnapshot[];
  ```

  This reuses `detectFields()` internally but returns only serializable `FieldSnapshot` objects (no DOM element references). Includes `currentValue` from `(el as HTMLInputElement).value ?? ''`.

  In `content.ts`, add a `chrome.runtime.onMessage` listener that handles:

  ```typescript
  { type: 'DETECT_FIELDS' }  →  { ok: true; fields: FieldSnapshot[] }
  ```

  Keep the listener side-effect-free on load (the message triggers the snapshot, not page load).

- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Returns `FieldSnapshot[]` for all fillable fields on the page
  - `currentValue` is the live DOM value at time of call
  - Excluded types (`password`, `file`, `hidden`, etc.) are not in the output
- **Validation**: `pnpm typecheck`; manual test on a form page

---

### Task 3.2: Add `APPLY_FIELDS` handler to `content.ts`

- **Location**: `src/content.ts`
- **Description**:

  Add handler for:

  ```typescript
  { type: 'APPLY_FIELDS'; fieldMap: FieldFill[] }  →  { ok: true; applied: number }
  ```

  For each `FieldFill` in `fieldMap`:
  1. Find the DOM element: `document.getElementById(fill.fieldId) ?? document.querySelector('[name="' + fill.fieldId + '"]')`
  2. Determine final value: `fill.editedValue ?? fill.proposedValue`
  3. Call existing `setFieldValue(element, value)` from `forms.ts`
  4. Skip if element not found (log to console)

  Return count of successfully applied fills.

- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Values are applied via `setFieldValue` (dispatches input/change events)
  - Skipped fields don't throw; they log a warning
  - Returns `{ ok: true; applied: number }`
- **Validation**: `pnpm typecheck`; manual test on a form page

---

### Task 3.3: Add `DETECT_FIELDS` + `APPLY_FIELDS` to `Message` type and background proxy

- **Location**: `src/types.ts`, `src/background.ts`
- **Description**:

  Add to `Message`:

  ```typescript
  | { type: 'DETECT_FIELDS'; tabId: number }
  | { type: 'APPLY_FIELDS'; tabId: number; fieldMap: FieldFill[] }
  ```

  Add to `MessageResponse`:

  ```typescript
  | { ok: true; fields: FieldSnapshot[] }
  | { ok: true; applied: number }
  ```

  Background `handle()` cases:
  - `DETECT_FIELDS`: `chrome.tabs.sendMessage(msg.tabId, { type: 'DETECT_FIELDS' })` → forward response
  - `APPLY_FIELDS`: `chrome.tabs.sendMessage(msg.tabId, { type: 'APPLY_FIELDS', fieldMap: msg.fieldMap })` → forward response

  This proxy pattern avoids the side panel needing the tab ID for content-script communication beyond one initial query.

- **Dependencies**: Task 3.1, Task 3.2, Task 1.2
- **Acceptance Criteria**:
  - TypeScript exhaustiveness check passes
  - Both messages proxy correctly through background
- **Validation**: `pnpm typecheck`

---

## Sprint 4: Ollama Structured Generation + Pipeline Orchestrator

**Goal**: Background can run the full 5-stage pipeline when triggered via port. Pipeline streams stage status updates back to the calling port and writes each stage to Obsidian log.

**Demo/Validation**:

- Open side panel or background console, open port named `'agent'`
- Send `AGENTIC_RUN` message with a valid workflowId and tabId
- Observe `AGENTIC_STAGE` messages streaming back (Understand → Collect → Plan → Draft → Review)
- Check Obsidian vault: a log file is created/appended with the run entry
- Port receives `AGENTIC_CONFIRM` with proposed field values

---

### Task 4.1: Add `generateStructured<T>()` to `ollama.ts`

- **Location**: `src/lib/ollama.ts`
- **Description**:

  ```typescript
  export async function generateStructured<T>(
    config: OllamaConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<T>;
  ```

  - Calls `POST /api/generate` with `{ model, system: systemPrompt, prompt: userPrompt, stream: false, format: 'json' }`
  - Parses `data.response` as JSON and returns typed `T`
  - Throws if response is not valid JSON (caller handles the error)
  - No `any` — uses `unknown` intermediate and type assertion at return

- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Generic `T` is inferred correctly at call sites
  - Throws on parse failure (not silently returns empty like `inferFieldValue`)
  - Added alongside existing functions without modifying them
- **Validation**: `pnpm typecheck`

---

### Task 4.2: Create `src/lib/pipeline.ts` — stage executors

- **Location**: `src/lib/pipeline.ts` (new file)
- **Description**: Implement one async function per Ollama stage. Each takes the accumulated context and config, returns the typed output:

  ```typescript
  export async function runUnderstand(
    config: OllamaConfig,
    workflow: WorkflowDefinition,
    fields: FieldSnapshot[],
    pageUrl: string,
  ): Promise<UnderstandOutput>;

  export async function runPlan(
    config: OllamaConfig,
    workflow: WorkflowDefinition,
    fields: FieldSnapshot[],
    understand: UnderstandOutput,
    profileText: string,
  ): Promise<PlanOutput>;

  export async function runDraft(
    config: OllamaConfig,
    workflow: WorkflowDefinition,
    fields: FieldSnapshot[],
    plan: PlanOutput,
  ): Promise<DraftOutput>;

  export async function runReview(
    config: OllamaConfig,
    workflow: WorkflowDefinition,
    draft: DraftOutput,
    plan: PlanOutput,
  ): Promise<ReviewOutput>;
  ```

  Each function:
  1. Builds a focused `userPrompt` string describing the stage's specific task
  2. Calls `generateStructured<T>(config, workflow.systemPrompt, userPrompt)`
  3. Context window guard: if `fields.length > 15`, send only `{ label, type }` per field (not `currentValue`, `placeholder`) to stay within 8k token budget

  Prompts must instruct the model to never invent data not present in the profile, never fill `password`/`file` fields, and always return the documented JSON shape.

- **Dependencies**: Task 4.1, Task 1.2
- **Acceptance Criteria**:
  - Each stage function returns the documented type or throws a descriptive error
  - Field truncation kicks in at > 15 fields
  - No `any` in function signatures
- **Validation**: `pnpm typecheck`

---

### Task 4.3: Add agent port handler to `background.ts`

- **Location**: `src/background.ts`
- **Description**: Add a `chrome.runtime.onConnect` listener for `port.name === 'agent'` (mirrors the existing `'chat'` port pattern).

  Port message protocol (received from side panel):

  ```typescript
  type AgentPortIn =
    | { type: 'AGENTIC_RUN'; workflowId: string; tabId: number }
    | { type: 'AGENTIC_APPLY'; tabId: number; fieldMap: FieldFill[] }
    | { type: 'AGENTIC_CANCEL' };
  ```

  Port message protocol (sent to side panel):

  ```typescript
  type AgentPortOut =
    | {
        type: 'AGENTIC_STAGE';
        stage: PipelineStage;
        status: 'running' | 'done' | 'error';
        summary?: string;
        durationMs?: number;
      }
    | { type: 'AGENTIC_CONFIRM'; proposed: FieldFill[]; logEntryId: string }
    | { type: 'AGENTIC_COMPLETE'; applied: number; logPath: string }
    | { type: 'AGENTIC_ERROR'; stage: PipelineStage; error: string };
  ```

  Pipeline orchestration on `AGENTIC_RUN`:
  1. Look up workflow from storage by `workflowId`
  2. Emit `AGENTIC_STAGE { stage: 'collect', status: 'running' }`
  3. Send `DETECT_FIELDS` message to tab (via `chrome.tabs.sendMessage`) → get `FieldSnapshot[]`
  4. Emit `AGENTIC_STAGE { stage: 'collect', status: 'done' }`
  5. For each of `understand`, `plan`, `draft`, `review` (skip `review` if `workflow.review === false`):
     - Emit `{ stage, status: 'running' }`
     - Call corresponding stage function from `pipeline.ts`
     - On error: emit `AGENTIC_ERROR` and `AGENTIC_STAGE { status: 'error' }`, then return (halt pipeline)
     - Emit `{ stage, status: 'done', summary: <one-line>, durationMs }`
     - Fire-and-forget: `appendToFile` the log entry to Obsidian (don't await — log failure is non-blocking)
  6. Build `FieldFill[]` from Review (or Draft) output
  7. Emit `AGENTIC_CONFIRM { proposed, logEntryId }`

  On `AGENTIC_APPLY`:
  - Send `APPLY_FIELDS` to content script → get applied count
  - Append completion log entry (fire-and-forget)
  - Emit `AGENTIC_COMPLETE { applied, logPath }`

  On `AGENTIC_CANCEL`:
  - Emit nothing; abandon run context

  Use an `AbortController` so a new `AGENTIC_RUN` on the same port cancels any in-progress run.

- **Dependencies**: Task 4.2, Task 3.3, Task 2.3
- **Acceptance Criteria**:
  - Pipeline runs all stages in order
  - Any single-stage failure halts pipeline and emits AGENTIC_ERROR
  - Log writes are fire-and-forget (pipeline not blocked by Obsidian latency)
  - A second AGENTIC_RUN cancels the first
- **Validation**: `pnpm typecheck`; test via background DevTools console

---

### Task 4.4: Implement Obsidian log format in `background.ts`

- **Location**: `src/background.ts` (log formatting helpers)
- **Description**: Add helper functions to build the Obsidian log markdown:

  ```typescript
  function buildRunHeader(workflow: WorkflowDefinition, url: string): string;
  // Returns: "## Run — <ISO timestamp>\n**Workflow:** ...\n**Page:** ..."

  function buildStageEntry(
    stage: PipelineStage,
    durationMs: number,
    summary: string,
    fullOutput?: string,
    logFullOutput?: boolean,
  ): string;
  // Returns stage sub-entry with optional <details> block for full output
  ```

  Log path: `fillix-logs/YYYY-MM-DD.md` (derive date from `new Date().toISOString().slice(0, 10)`).

  Ensure no value matching `/\b(password|token|secret|key|bearer)\s*[:=]\s*\S+/i` is written to the log (redact with `[REDACTED]`).

- **Dependencies**: Task 4.3
- **Acceptance Criteria**:
  - Log file appears in Obsidian vault after a run
  - Each run appends a new `## Run` section
  - Redaction regex prevents secret-like values from appearing in logs
- **Validation**: Manual end-to-end test with a real form

---

## Sprint 5: Side Panel — Agent Tab UI

**Goal**: Full end-to-end user flow works through the browser UI. User can select a workflow, observe pipeline progress, review the diff table, edit values, and apply them.

**Demo/Validation**:

- Open a form page, open side panel
- Click "Agent" tab — workflow dropdown is populated from storage
- Click Run — observe stage indicators animate through Understand → Collect → Plan → Draft → Review
- Confirm diff table appears with Field / Current / Proposed columns
- Edit a proposed value inline
- Click Apply — form fields update on the page
- Side panel shows "Completed: N fields applied"

---

### Task 5.1: Add Agent tab HTML structure to `sidepanel/index.html`

- **Location**: `src/sidepanel/index.html`
- **Description**: Add an "Agent" tab button alongside "Chat" and "Settings". Add the agent panel `<div>` (hidden by default) containing:

  ```html
  <!-- Workflow selector section -->
  <div id="agent-selector">
    <select id="workflow-select">
      <option value="">— select workflow —</option>
    </select>
    <button id="workflow-refresh-btn" title="Refresh workflows">↺</button>
    <button id="agent-run-btn" disabled>Run</button>
  </div>

  <!-- Pipeline progress list -->
  <ol id="pipeline-stages" hidden>
    <!-- li.stage-item[data-stage="understand|collect|plan|draft|review"] populated by JS -->
  </ol>

  <!-- Confirm diff table (shown after Review stage completes) -->
  <div id="agent-confirm" hidden>
    <table id="confirm-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Current</th>
          <th>Proposed</th>
        </tr>
      </thead>
      <tbody id="confirm-tbody"></tbody>
    </table>
    <div id="agent-confirm-actions">
      <button id="agent-apply-btn">Apply</button>
      <button id="agent-cancel-btn">Cancel</button>
    </div>
  </div>

  <!-- Post-apply summary -->
  <p id="agent-complete" hidden></p>

  <!-- Non-blocking log warning -->
  <p id="agent-log-warning" hidden></p>
  ```

- **Dependencies**: None (HTML only)
- **Acceptance Criteria**:
  - Agent tab is visually consistent with Chat and Settings tabs
  - All `id` attributes match what JS will query
  - Panel hidden by default; tab click reveals it (existing tab-switching logic handles this)
- **Validation**: Visual check in Chrome

---

### Task 5.2: Create `src/sidepanel/agent.ts` — workflow selector + port controller

- **Location**: `src/sidepanel/agent.ts` (new file)
- **Description**: Encapsulate all Agent tab logic:

  ```typescript
  export function initAgentPanel(): void;
  ```

  On init:
  1. Send `WORKFLOWS_LIST` message → populate `#workflow-select` options
  2. Enable `#agent-run-btn` when a workflow is selected
  3. Wire `#workflow-refresh-btn` → send `WORKFLOWS_REFRESH` then re-populate dropdown

  On `#agent-run-btn` click:
  1. `chrome.tabs.query({ active: true, currentWindow: true })` → get `tabId`
  2. Open port: `const port = chrome.runtime.connect({ name: 'agent' })`
  3. Send `AGENTIC_RUN { workflowId, tabId }` via port
  4. Show `#pipeline-stages`; disable Run button
  5. Listen on `port.onMessage`:
     - `AGENTIC_STAGE`: update the matching `<li>` with status icon + duration
     - `AGENTIC_CONFIRM`: call `showConfirmTable(proposed)`
     - `AGENTIC_COMPLETE`: call `showComplete(applied)`
     - `AGENTIC_ERROR`: mark stage as error, show error message inline

  `showConfirmTable(proposed: FieldFill[])`:
  - Populate `#confirm-tbody` with one row per fill: label | currentValue | editable `<input>` pre-filled with proposedValue
  - Show `#agent-confirm`

  `#agent-apply-btn` click:
  - Read edited values from `<input>` cells; build final `FieldFill[]` with `editedValue` set
  - Send `AGENTIC_APPLY { tabId, fieldMap }` via port

  `#agent-cancel-btn` click:
  - Send `AGENTIC_CANCEL` via port
  - Reset UI to selector state

- **Dependencies**: Task 4.3, Task 5.1, Task 1.2
- **Acceptance Criteria**:
  - Workflow dropdown populates on tab open
  - Stage indicators update in real time as pipeline runs
  - Confirm table rows are editable
  - Apply/Cancel work correctly
  - Port is disconnected on Cancel or Complete
- **Validation**: Full manual end-to-end test on a real form

---

### Task 5.3: Wire `initAgentPanel()` into `sidepanel/main.ts`

- **Location**: `src/sidepanel/main.ts`
- **Description**: Import and call `initAgentPanel()` from the existing `initSidePanel()` function. Wire the Agent tab button to the tab-switching logic (same pattern as Chat ↔ Settings toggle).

- **Dependencies**: Task 5.2
- **Acceptance Criteria**:
  - Agent tab click shows the agent panel; other tabs hide it
  - Agent panel initializes only once on side panel load
- **Validation**: `pnpm typecheck`; visual check in Chrome

---

## Sprint 6: Settings — Workflows Folder Configuration

**Goal**: User can configure which vault subfolder holds workflow files and trigger a manual refresh from the Settings tab.

**Demo/Validation**:

- Open Settings tab → a "Workflows folder" text input appears, defaulting to `"fillix-workflows"`
- Change the value, click Save → reload extension → folder path persists
- Create a `.md` file with valid frontmatter in the configured folder in Obsidian
- Click Agent tab → Refresh button → workflow appears in dropdown

---

### Task 6.1: Add workflows folder input to settings HTML and `popup/main.ts`

- **Location**: `src/sidepanel/index.html`, `src/sidepanel/main.ts`
- **Description**: In the Settings tab, add a labelled text input for the workflows folder path. On settings load (`loadSidepanelSettings()`), populate from `getWorkflowsFolder()`. On Save, call `setWorkflowsFolder(value)`.

  Also add to `src/popup/index.html` and `src/popup/main.ts` for parity (popup is the options page).

- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Input persists via storage
  - Default value `"fillix-workflows"` is shown when unset
- **Validation**: `pnpm typecheck`; manual round-trip test

---

### Task 6.2: Auto-refresh workflows on extension load

- **Location**: `src/background.ts`
- **Description**: In the `chrome.runtime.onInstalled` listener (or top-level background script init), call `WORKFLOWS_REFRESH` logic automatically on extension load if an Obsidian config and workflows folder are set. This ensures the dropdown is pre-populated without the user having to click Refresh.

  Wrap in a try/catch so Obsidian being unreachable on load doesn't throw an unhandled error.

- **Dependencies**: Task 2.4
- **Acceptance Criteria**:
  - On extension reload, workflows are refreshed automatically if Obsidian config is set
  - Failure (Obsidian unreachable) is silently logged to console, not surfaced as an error
- **Validation**: Reload extension → Agent tab → dropdown already populated

---

## Testing Strategy

- **After each sprint**: `pnpm typecheck` + `pnpm build` must pass
- **Sprint 3**: Manual test `DETECT_FIELDS` and `APPLY_FIELDS` on `https://httpbin.org/forms/post` (simple HTML form)
- **Sprint 4**: Manual pipeline run test; verify Obsidian log file is created and appended correctly
- **Sprint 5**: Full end-to-end test: job application form → workflow → confirm table → apply → fields populated
- **Sprint 6**: Verify folder path persists and refresh populates workflows

No automated test runner is installed yet. If adding vitest, update `CLAUDE.md`.

---

## Potential Risks & Gotchas

### 1. Port lifecycle: side panel closes mid-run

If the user closes the side panel while a pipeline is running, the port disconnects. The background `onDisconnect` handler must abort the pipeline (`AbortController.abort()`) to prevent orphaned Ollama calls.
**Mitigation**: Add `port.onDisconnect` → call `abortController.abort()` in the agent port handler.

### 2. `js-yaml` and YAML spec edge cases

`js-yaml` is permissive, but YAML `true`/`false` bare values (e.g., `review: true`) parse as booleans correctly. The risk is users writing unquoted strings that YAML interprets as other types. **Mitigation**: Normalize all string fields with `String(value)` after `load()`.

### 3. `chrome.tabs.sendMessage` fails if content script isn't injected

On extension-internal pages (e.g., `chrome://`, `chrome-extension://`) and some browser pages, content scripts don't run. Sending `DETECT_FIELDS` to those tabs will throw.
**Mitigation**: Catch the `chrome.runtime.lastError` after `chrome.tabs.sendMessage`; emit `AGENTIC_ERROR` with a clear message: "No form detected on this page".

### 4. Context window overflow on Plan/Draft stages

The pipeline passes accumulated context forward. On large forms (20+ fields) + long system prompts + profile text, the prompt may exceed the model's 8k context window.
**Mitigation**: Task 4.2 already applies the `> 15 fields` truncation. Additionally, cap the profile text at 2000 characters in pipeline prompts.

### 5. Review stage always returns identical output

If the Review model output is identical to Draft (within a configurable threshold), the PRD says mark it "no changes". This matters for UX (avoid confusing the user). **Mitigation**: Implement a simple Levenshtein distance check in the `runReview` stage output handler; if edit distance < 5% of total characters, annotate with `noChanges: true` and surface that in the stage indicator.

### 6. `WORKFLOWS_LIST` returns stale data

The workflows list is cached in storage. If the user edits a workflow file in Obsidian and doesn't refresh, the run uses the old version.
**Mitigation**: Snapshot workflow definition into the run context at `AGENTIC_RUN` time (already done in Task 4.3 design). Add a "last refreshed" timestamp to the Agent tab UI.

### 7. Obsidian append race condition

`appendToFile` reads then writes. Concurrent runs could overwrite each other's log entries if two pipelines run simultaneously. This is a known limitation for v1 (PRD states "one workflow execution per active tab at a time") — enforce this by tracking active port per tab in background state.

---

## Rollback Plan

All changes are additive (new files + new branches in `types.ts` switch statements). Rolling back means:

1. Delete `src/lib/pipeline.ts`, `src/lib/workflow.ts`, `src/sidepanel/agent.ts`
2. Revert additions to `types.ts`, `storage.ts`, `background.ts`, `obsidian.ts`, `ollama.ts`
3. Revert HTML additions to `sidepanel/index.html`
4. `pnpm build` to confirm extension works

No existing behavior (Chat tab, legacy fill button, Obsidian read integration) is modified.
