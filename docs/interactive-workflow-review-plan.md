# Plan: Interactive Workflow Review

**Generated**: 2026-04-22  
**Estimated Complexity**: High  
**PRD**: `docs/workflow-interactive-review.md`

---

## Overview

This plan implements the full Interactive Workflow Review PRD across seven sprints. The core idea is replacing the silent end-to-end pipeline (with its static ConfirmTable) with a conversational thread that pauses at two gates — after planning and after drafting — letting the user approve or redirect with natural language before LLM costs are spent on subsequent stages.

Alongside the gate architecture, we improve prompt quality (chain-of-thought + few-shot + retry), extract visible conversation threads from messaging platforms, and introduce a `message-reply` workflow type that composes replies from conversation context.

**Approach:**

1. Rename + type contract first (Sprint 1) — gives a clean compile base for all downstream work.
2. Smarter prompts next (Sprint 2) — isolated, testable, no UI changes yet.
3. Gate architecture in background (Sprint 3) — pipeline suspends and resumes; no UI yet.
4. Conversation extraction (Sprint 4) — new module, independent of the UI.
5. Workflow UI (Sprint 5) — visual thread + inputs wired to the gates.
6. `message-reply` end-to-end (Sprint 6) — ties together extraction + gates.
7. Tests + polish (Sprint 7) — close coverage gaps, typecheck, final build.

---

## Prerequisites

- Node / pnpm installed; `pnpm install` has been run.
- Chrome with Developer Mode on; `dist/` loaded as unpacked extension.
- Ollama running locally with at least one model pulled.
- Access to WhatsApp Web and/or LinkedIn Messaging for Sprint 4–6 manual validation.

---

## Sprint 1: Foundation — Rename + Type Contract

**Goal**: Compile-clean rename of the Agent tab to Workflow everywhere, plus the complete updated type contract in `types.ts`. No functional behaviour changes yet.

**Demo/Validation**:

- Side-panel tab label reads "Workflow" (was "Agent").
- `pnpm typecheck` passes with zero errors.
- `pnpm test` passes (all renamed test files resolve).
- Background connects on port `'workflow'`; old port name `'agent'` is gone.

---

### Task 1.1: git-rename AgentTab and agent store

- **Location**: `src/sidepanel/tabs/AgentTab.svelte` → `WorkflowTab.svelte`; `src/sidepanel/stores/agent.ts` → `workflow.ts`
- **Description**: Use `git mv` for both files so history is preserved. Do not change file contents yet — just move.
- **Acceptance Criteria**:
  - Both files exist at new paths; old paths are gone in git status.
- **Validation**: `git status` shows renames, not deletions.

---

### Task 1.2: Rename corresponding spec files

- **Location**: `src/sidepanel/tabs/AgentTab.spec.ts` → `WorkflowTab.spec.ts`; `src/sidepanel/__tests__/agent-store.spec.ts` → `workflow-store.spec.ts`; `src/sidepanel/__tests__/agent-tab.spec.ts` → `workflow-tab.spec.ts`; `src/sidepanel/__tests__/agent.spec.ts` → `workflow.spec.ts`
- **Description**: `git mv` each spec file to match the module it tests.
- **Acceptance Criteria**: All spec files are at new paths; `pnpm test` still discovers them.
- **Validation**: `pnpm test --reporter=verbose` lists `WorkflowTab.spec.ts` in output.

---

### Task 1.3: Update all import paths after rename

- **Location**: `src/sidepanel/App.svelte`, every file that imports from the old paths
- **Description**: Update every `import ... from './tabs/AgentTab'` to `'./tabs/WorkflowTab'` and `from '../stores/agent'` to `'../stores/workflow'`. Update spec file imports likewise.
- **Dependencies**: Tasks 1.1–1.2
- **Acceptance Criteria**: No dangling imports; `pnpm typecheck` passes.
- **Validation**: `pnpm typecheck`

---

### Task 1.4: Rename port 'agent' → 'workflow' everywhere

- **Location**: `src/sidepanel/App.svelte` (connect call + context key), `src/background.ts` (onConnect handler), any helper that references `'agent'` port name or context key `agentPort`
- **Description**: Change `chrome.runtime.connect({ name: 'agent' })` to `'workflow'`; update `setContext('agentPort', ...)` to `setContext('workflowPort', ...)`; update `getContext('agentPort')` calls in WorkflowTab.svelte; update `background.ts` `case 'agent':` → `case 'workflow':`.
- **Dependencies**: Task 1.3
- **Acceptance Criteria**: No references to port name `'agent'` remain; extension reconnects cleanly after reload.
- **Validation**: Open extension; DevTools service worker console shows no disconnect errors.

---

### Task 1.5: Update types.ts — new message contract

- **Location**: `src/types.ts`
- **Description**: Apply the full type changes from the PRD's "New / Changed Message Types" section:
  - **Add** to the `Message` union: `AGENTIC_PLAN_REVIEW`, `AGENTIC_PLAN_FEEDBACK`, `AGENTIC_FILLS_REVIEW`, `AGENTIC_FILLS_FEEDBACK`, `AGENTIC_SUMMARY`, `EXTRACT_CONVERSATION`, `CONVERSATION_DATA`, `INSERT_TEXT`
  - **Remove** `AGENTIC_CONFIRM` and `AGENTIC_APPLY` from the union (replaced by gate messages)
  - **Add** interface: `ConversationMessage { sender: 'me' | 'them'; text: string }`
  - **Extend** `PipelineStage` union to include `'plan-review' | 'fills-review'`
  - **Extend** `WorkflowDefinition.taskType` to include `'message-reply'`
  - **`AGENTIC_FILLS_REVIEW` payload**: define as a full discriminated union up-front — `{ kind: 'form'; fills: FieldFill[] } | { kind: 'reply'; replyText: string }` — so Sprints 3–6 all compile against one stable type without an intermediate breaking change.
  - **`INSERT_TEXT` payload**: `{ text: string }` (bg → content); response: `{ ok: true } | { ok: false; reason: string }`
  - Exact payloads for remaining types per PRD table (Section 4, "New / Changed Message Types")
- **Dependencies**: None (types are the contract, not the implementation)
- **Acceptance Criteria**: TypeScript discriminated union is exhaustive; `background.ts` `handle` switch gets new `case` stubs (even if `throw new Error('not implemented')`) so the exhaustiveness check does not fail.
- **Validation**: `pnpm typecheck`

---

### Task 1.6: Update App.svelte tab label to "Workflow"

- **Location**: `src/sidepanel/App.svelte`
- **Description**: Change `<TabsTrigger value="agent">Agent</TabsTrigger>` to `value="workflow"` and label "Workflow"; update the corresponding `<TabsContent value="agent">` to `value="workflow"`; update `let currentTab = $state('chat')` default if it was `'agent'`.
- **Dependencies**: Task 1.3–1.4
- **Acceptance Criteria**: Tab renders "Workflow"; clicking it still shows WorkflowTab content.
- **Validation**: Load extension; side panel shows "Workflow" tab.

---

## Sprint 2: Smarter Plan Prompts

**Goal**: `runPlan()` and `runDraft()` in `pipeline.ts` produce better first-pass results. `<thinking>` blocks are stripped; one auto-retry on JSON parse failure; 5 few-shot examples are embedded; richer context is accepted.

**Demo/Validation**:

- `pnpm test src/lib/__tests__/pipeline.spec.ts` passes with new test cases for CoT stripping, retry, and feedback.
- Manual spot-check: open a form page, run the workflow, observe `<thinking>` output stripped from plan JSON in DevTools.

---

### Task 2.1: Add `<thinking>` block stripper utility

- **Location**: `src/lib/pipeline.ts` (or extract to `src/lib/cot-parser.ts` if it grows beyond ~20 lines)
- **Description**: Write `stripThinking(raw: string): string` that removes everything between `<thinking>` and `</thinking>` (inclusive). If no closing tag is found, return `raw` unchanged (graceful fallback for models that ignore the instruction).
- **Acceptance Criteria**: Pure function; no side effects; handles absent tags, multiple tags, and empty thinking blocks.
- **Validation**: Unit test: `stripThinking('<thinking>x</thinking>{"a":1}')` → `'{"a":1}'`.

---

### Task 2.2: Add JSON validation + one-retry helper

- **Location**: `src/lib/pipeline.ts`
- **Description**: Extract or inline a `parseWithRetry<T>(generate: (extraHint?: string) => Promise<string>, schema: ZodSchema<T>): Promise<T>` helper (or equivalent without Zod — match the existing pattern). On first parse failure, append the error message to the prompt and call `generate` once more. On second failure, throw a structured error with `stage` and `rawResponse` fields. Log `console.warn('[fillix] pipeline retry:', stage)` on every retry (per PRD evaluation strategy).
- **Acceptance Criteria**: Only one retry attempted; error on second failure carries stage name.
- **Validation**: Unit test: mock `generate` to return bad JSON twice → expect throw; mock to return bad then good → expect parse success.

---

### Task 2.3: Update `runPlan()` with CoT + few-shot + richer context

- **Location**: `src/lib/pipeline.ts`, `runPlan()`
- **Description**:
  - Add optional parameters `feedback?: string`, `conversation?: ConversationMessage[]` to the signature.
  - Extend the call site to accept `pageTitle: string` and `fieldsContext: { label: string; type: string; placeholder: string }[]`.
  - Restructure the system prompt to follow the PRD's prompt architecture (Section 3):
    - Role definition + constraints.
    - 5 few-shot `<thinking>` + JSON pairs covering: login/registration, contact/inquiry, job application, WhatsApp reply, LinkedIn reply (archetypes from PRD Section 3 table).
    - Closing `IMPORTANT: output <thinking> first, then valid JSON only`.
  - If `feedback` is provided, append `Previous plan: {plan JSON}\nUser feedback: {feedback}` to the user turn before the JSON schema instruction.
  - If `conversation` is provided, prepend a `Conversation context:` block to the user turn.
  - Wrap the generate call with `parseWithRetry`.
- **Acceptance Criteria**: Signature change is backwards-compatible (all new params optional); existing callers still compile.
- **Validation**: `pnpm typecheck`; `pnpm test pipeline.spec.ts`.

---

### Task 2.4: Update `runDraft()` with same CoT + few-shot + feedback

- **Location**: `src/lib/pipeline.ts`, `runDraft()`
- **Description**: Mirror Task 2.3 for `runDraft()`. Add `feedback?: string`. Add 3 few-shot examples specific to draft output (field-fill JSON pairs for the same archetypes). Wrap with `parseWithRetry`.
- **Dependencies**: Tasks 2.1–2.3
- **Acceptance Criteria**: `feedback` is appended to user turn when present.
- **Validation**: `pnpm test pipeline.spec.ts`

---

### Task 2.5: Update `pipeline.spec.ts`

- **Location**: `src/lib/__tests__/pipeline.spec.ts`
- **Description**: Add / update test cases:
  - `<thinking>` stripped before JSON parse.
  - Retry fires once on first bad JSON; succeeds on second good response.
  - `feedback` string appears in the generated prompt text.
  - `conversation` block appears in the generated prompt text when provided.
  - Retry limit (second failure) throws with stage name.
- **Dependencies**: Tasks 2.1–2.4
- **Validation**: `pnpm test pipeline.spec.ts` — all cases green.

---

## Sprint 3: Pipeline Gates

**Goal**: `agent-runner.ts` suspends after plan and after fills, emits the new review messages, loops on feedback, and resumes on approval. `background.ts` routes the two feedback message types.

**Demo/Validation**:

- Manually run a workflow; pipeline pauses after plan (DevTools port log shows `AGENTIC_PLAN_REVIEW`).
- Send `AGENTIC_PLAN_FEEDBACK { approved: true }` from DevTools; pipeline advances to fills.
- Pipeline pauses after fills (`AGENTIC_FILLS_REVIEW`); send `AGENTIC_FILLS_FEEDBACK { approved: true }`; fields are applied; `AGENTIC_SUMMARY` is emitted.
- `autoApply: true` workflow skips both gates and applies directly.

---

### Task 3.1: Add Promise-gate factory to agent-runner.ts

- **Location**: `src/lib/agent-runner.ts`
- **Description**: Add a `createGate<T>()` helper that returns `{ wait: () => Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void }`. Store active gate references so `port.onDisconnect` can reject them. This avoids deadlock if the side panel closes mid-run.
- **Acceptance Criteria**: Gate resolves/rejects correctly; disconnect always rejects pending gate.
- **Validation**: Unit test: create gate, disconnect → gate rejects.

---

### Task 3.2: Insert plan review gate after plan stage

- **Location**: `src/lib/agent-runner.ts`, `runAgentPipeline()`
- **Description**: After `runPlan()` succeeds, emit `AGENTIC_PLAN_REVIEW { plan }` on the port. Suspend execution by `await gate.wait()`. On resume:
  - If `feedback` is present and iteration count < 5: re-run `runPlan()` with `feedback` appended, emit new `AGENTIC_PLAN_REVIEW`, await gate again.
  - If iteration count reaches 5: emit `AGENTIC_ERROR { stage: 'plan-review', error: 'Max feedback iterations reached' }` and return.
  - If `approved: true`: advance to draft stage.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**: Iteration cap at 5; clean abort on cancel; abort signal respected during re-run.
- **Validation**: Integration test with mocked port; plan gate resolves immediately on first approved message.

---

### Task 3.3: Insert fills review gate after draft/review stage

- **Location**: `src/lib/agent-runner.ts`
- **Description**: After `runDraft()` (and optional `runReview()`) completes, build `FieldFill[]` via `buildFieldFills()` and emit `AGENTIC_FILLS_REVIEW { fills }`. Suspend with `await gate.wait()`. On resume:
  - If `feedback`: re-run `runDraft()` with feedback, rebuild fills, re-emit, await gate.
  - If `approved: true`: proceed to apply.
- **Dependencies**: Task 3.2
- **Acceptance Criteria**: Message-reply workflows emit a single text block (not a `FieldFill[]`); fills review gate behaves identically for both.
- **Validation**: Same mocked-port integration test; fills gate resolves on first approved.

---

### Task 3.4: Handle `autoApply: true` workflows

- **Location**: `src/lib/agent-runner.ts`
- **Description**: When `workflow.autoApply === true`, resolve both gate promises immediately without emitting the review messages. Preserve `autoApply` semantics exactly as before.
- **Dependencies**: Tasks 3.2–3.3
- **Acceptance Criteria**: `autoApply` runs end-to-end without pausing; no review messages sent to UI.
- **Validation**: Unit test with `autoApply: true` workflow — no `AGENTIC_PLAN_REVIEW` or `AGENTIC_FILLS_REVIEW` messages emitted.

---

### Task 3.5: Emit AGENTIC_SUMMARY; remove old confirm path

- **Location**: `src/lib/agent-runner.ts`
- **Description**: After fields are applied (content script `APPLY_FIELDS` returns), emit `AGENTIC_SUMMARY { applied: number; skipped: number; durationMs: number }`. Remove the old `AGENTIC_CONFIRM` emission and the `AGENTIC_APPLY` handler entirely.
- **Dependencies**: Tasks 3.3–3.4
- **Acceptance Criteria**: `AGENTIC_CONFIRM` is not emitted anywhere; `AGENTIC_SUMMARY` is always the final message on a successful run.
- **Validation**: Search codebase for `AGENTIC_CONFIRM` — zero occurrences.

---

### Task 3.6: Update background.ts routing for new port messages

- **Location**: `src/background.ts`
- **Description**: In the `'workflow'` port `onMessage` handler, add routing for `AGENTIC_PLAN_FEEDBACK` and `AGENTIC_FILLS_FEEDBACK` — both should resolve the corresponding pending gate in the active pipeline run. Remove the `AGENTIC_APPLY` case. Ensure the TypeScript exhaustiveness check (`default: assertNever(msg)`) still compiles.
- **Dependencies**: Tasks 1.5, 3.1–3.5
- **Acceptance Criteria**: Feedback messages reach the correct gate; no unhandled message warnings.
- **Validation**: `pnpm typecheck`; manual extension test from Sprint 3 demo.

---

## Sprint 4: Conversation Extraction

**Goal**: A new `conversation-extractor.ts` module scrapes visible conversation messages from WhatsApp Web and LinkedIn Messaging. The content script handles the trigger message; background sends it for `message-reply` workflows.

**Demo/Validation**:

- Load WhatsApp Web with an open chat; run extraction via DevTools console injection; confirm up to 20 messages returned in `{ sender, text }` format.
- Load LinkedIn Messaging; same test.
- Load a non-messaging page; confirm empty array returned without error.

---

### Task 4.1: Create `src/lib/conversation-extractor.ts`

- **Location**: `src/lib/conversation-extractor.ts` (new file)
- **Description**: Export `extractConversation(): ConversationMessage[]`. Function returns at most the 20 most-recent messages in chronological order. Delegates to platform-specific helpers based on `window.location.hostname`. Returns `[]` on any error or unknown platform (never throws).
- **Acceptance Criteria**: File ≤ 150 lines; pure DOM reads; no storage writes; no imports from background or sidepanel.
- **Validation**: Unit test with jsdom mocking document structure.

---

### Task 4.2: Add WhatsApp Web selectors

- **Location**: `src/lib/conversation-extractor.ts`
- **Description**: Implement `extractWhatsapp()` using `web.whatsapp.com` DOM selectors. Each message bubble: determine sender (`me` if outgoing class is present, else `them`); extract `.copyable-text` or equivalent text content. Return array of `ConversationMessage`.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**: Works on current WhatsApp Web DOM (as of plan date); returns empty array if selectors find nothing.
- **Validation**: Manual test on `web.whatsapp.com`.

---

### Task 4.3: Add LinkedIn Messaging selectors

- **Location**: `src/lib/conversation-extractor.ts`
- **Description**: Implement `extractLinkedIn()` for `linkedin.com/messaging`. Use `.msg-s-event-listitem` or equivalent. Sender detection via presence of `msg-s-message-group__name` matching profile name.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**: Works on current LinkedIn Messaging DOM; empty array fallback.
- **Validation**: Manual test on `linkedin.com/messaging`.

---

### Task 4.4: Update content.ts to handle EXTRACT_CONVERSATION

- **Location**: `src/content.ts`
- **Description**: Add a `case 'EXTRACT_CONVERSATION':` in the `chrome.runtime.onMessage` handler. Call `extractConversation()`, return `{ messages, platform: detectPlatform() }` (where `detectPlatform()` returns a string like `'whatsapp'`, `'linkedin'`, or `null`). Since the function never throws, no try/catch needed.
- **Dependencies**: Tasks 4.1–4.3
- **Acceptance Criteria**: Message handler is synchronous; returns a plain object (not a Promise, unless using `sendResponse` async pattern already in use — match existing content.ts pattern).
- **Validation**: `pnpm test src/__tests__/content.spec.ts`; manual background → content round-trip.

---

### Task 4.5: Update background.ts to send EXTRACT_CONVERSATION for message-reply workflows

- **Location**: `src/background.ts`, `runAgentPipeline()` entry point (or agent-runner.ts orchestrator)
- **Description**: Before the plan stage, if `workflow.taskType === 'message-reply'`, send `{ type: 'EXTRACT_CONVERSATION' }` to the active tab and await `CONVERSATION_DATA`. Store the result as `conversation: ConversationMessage[]`. Pass it to `runPlan()` and `runDraft()`.
- **Dependencies**: Tasks 2.3, 4.4
- **Acceptance Criteria**: For non-message-reply workflows, no extraction is attempted. Empty array on extraction failure does not abort the pipeline.
- **Validation**: `pnpm typecheck`; integration test with mocked tab messaging.

---

### Task 4.6: Add `conversation-extractor.spec.ts`

- **Location**: `src/lib/__tests__/conversation-extractor.spec.ts` (new file)
- **Description**: Unit tests using jsdom:
  - Unknown hostname → empty array.
  - WhatsApp: mock DOM with 3 incoming + 2 outgoing bubbles → correct `sender` values.
  - LinkedIn: same pattern.
  - More than 20 messages → only last 20 returned.
  - DOM error during extraction → empty array, no throw.
- **Dependencies**: Task 4.1–4.3
- **Validation**: `pnpm test conversation-extractor.spec.ts` — all green.

---

## Sprint 5: Workflow UI — Store + Thread Components

**Goal**: The Workflow tab is a chat-like thread. The store drives `agentMessages[]` and `pendingGate` state. `WorkflowMessage.svelte` renders each bubble type. `WorkflowTab.svelte` shows the thread + feedback input. `ConfirmTable.svelte` is removed.

**Demo/Validation**:

- Run a workflow end-to-end in the UI: plan bubble appears → type feedback → revised plan appears → click Approve → fills bubble appears → type feedback → revised fills appear → click Approve → summary bubble appears.
- Thread is read-only after summary.
- Starting a new run clears the thread.

---

### Task 5.1: Rewrite workflow store (`src/sidepanel/stores/workflow.ts`)

- **Location**: `src/sidepanel/stores/workflow.ts`
- **Description**: Replace `confirmFields: FieldFill[]` with:
  - `agentMessages: AgentThreadMessage[]` — discriminated union covering message types: `plan-review`, `fills-review`, `user-feedback`, `summary`, `error`.
  - `pendingGate: 'plan' | 'fills' | null`.
  - `planFeedbackCount: number`, `fillFeedbackCount: number` (for in-memory tracking per PRD).
  - Update `handleStageUpdate`, `handleConfirm`, `applyFields`, `cancelRun` to drive the new state shape.
  - Add `addMessage()`, `setPendingGate()`, `clearThread()` helpers.
- **Acceptance Criteria**: Store is a pure Svelte 5 `$state` / writable store; no chrome API calls inside the store (those stay in the tab component or port helpers).
- **Validation**: `pnpm test workflow-store.spec.ts` updated for new shape.

---

### Task 5.2: Create `WorkflowMessage.svelte`

- **Location**: `src/sidepanel/components/WorkflowMessage.svelte` (new file)
- **Description**: Single component that accepts a `message: AgentThreadMessage` prop and renders the appropriate bubble:
  - **`plan-review`**: Labelled bubble showing task type, fields-to-fill list, missing fields, tone, notes. Style: assistant/system bubble (left-aligned or distinct background).
  - **`fills-review`** (form): Field list — each entry shows label + proposed value. Style: same assistant bubble.
  - **`fills-review`** (message-reply): Single text block for the composed reply.
  - **`user-feedback`**: User's own text, right-aligned.
  - **`summary`**: Applied count, skipped count (with reasons), run duration.
  - **`error`**: Red error message.
- **Acceptance Criteria**: Component has a single responsibility — rendering a message; no store imports; no port calls.
- **Validation**: Storybook-style unit test rendering each variant.

---

### Task 5.3: Rewrite `WorkflowTab.svelte`

- **Location**: `src/sidepanel/tabs/WorkflowTab.svelte`
- **Description**: Replace pipeline-stage + ConfirmTable layout with:
  - Scrollable message thread that renders `{#each $agentMessages as msg}<WorkflowMessage {message=msg} />{/each}`.
  - Feedback input (text area + Approve button) shown only when `$pendingGate !== null`.
  - Submit on Enter (Shift+Enter for newline) or button click — sends feedback string.
  - Approve button sends `{ approved: true }` without feedback text.
  - Cancel button visible only while a run is active; clears thread and sends AGENTIC_CANCEL.
  - Thread scrolls to bottom on each new message.
  - After summary, the input area disappears entirely.
  - Workflow selector and Run button remain at the top (same as current AgentTab).
- **Port messages handled in this component**:
  - `AGENTIC_PLAN_REVIEW` → add plan-review message, set `pendingGate = 'plan'`.
  - `AGENTIC_FILLS_REVIEW` → add fills-review message, set `pendingGate = 'fills'`.
  - `AGENTIC_SUMMARY` → add summary message, set `pendingGate = null`.
  - `AGENTIC_STAGE` → still used for loading indicators during in-progress stages.
  - `AGENTIC_ERROR` → add error message, set `pendingGate = null`.
- **Dependencies**: Tasks 5.1–5.2
- **Acceptance Criteria**: No reference to `ConfirmTable`; no `AGENTIC_CONFIRM` handling.
- **Validation**: Full interactive test per Sprint 5 demo.

---

### Task 5.4: Delete `ConfirmTable.svelte` and its spec files

- **Location**: `src/sidepanel/components/ConfirmTable.svelte`, `src/sidepanel/components/ConfirmTable.spec.ts`, `src/sidepanel/__tests__/confirm-table.spec.ts`
- **Description**: Delete all three files. Verify no remaining imports.
- **Dependencies**: Task 5.3
- **Acceptance Criteria**: Zero imports of `ConfirmTable` anywhere; `pnpm typecheck` passes.
- **Validation**: `grep -r "ConfirmTable" src/` returns nothing.

---

### Task 5.5: Remove `PipelineStages.svelte`

- **Location**: `src/sidepanel/components/PipelineStages.svelte`, `src/sidepanel/components/PipelineStages.spec.ts`, `src/sidepanel/__tests__/pipeline-stages.spec.ts`
- **Description**: Delete the component and both spec files. The chat thread already provides stage-progress feedback via `AGENTIC_STAGE` bubbles; the dot-based visualizer is redundant and would create layout conflict above the thread. Remove all imports.
- **Dependencies**: Task 5.3 (WorkflowTab no longer imports it)
- **Acceptance Criteria**: Zero imports of `PipelineStages` anywhere; `pnpm typecheck` passes.
- **Validation**: `grep -r "PipelineStages" src/` returns nothing.

---

## Sprint 6: `message-reply` Workflow End-to-End

**Goal**: A `message-reply` workflow type reads an open conversation, composes a contextual reply, shows it in the fills review gate, and inserts it into the page compose box on approval.

**Demo/Validation**:

- On WhatsApp Web with a chat open: run a `message-reply` workflow → plan bubble summarises last message + reply strategy → fills bubble shows composed reply text → Approve → text appears in WhatsApp compose box (not sent).
- On a non-messaging page with a `message-reply` workflow: approve fills → error bubble "no compose box detected", nothing inserted.
- Word count shown in summary bubble.

---

### Task 6.1: Handle `message-reply` skip of DETECT_FIELDS in agent-runner

- **Location**: `src/lib/agent-runner.ts`
- **Description**: When `workflow.taskType === 'message-reply'`, skip the Collect stage entirely (no `DETECT_FIELDS` message to content script). Emit the Collect stage as immediately done with a `summary: 'conversation mode — no form fields'`. Pass the extracted `conversation` (from background.ts, Task 4.5) to `runPlan()`.
- **Dependencies**: Tasks 3.2, 4.5
- **Acceptance Criteria**: No `DETECT_FIELDS` message is sent for `message-reply` workflows.
- **Validation**: Unit test with `taskType: 'message-reply'` — verify `DETECT_FIELDS` is not called.

---

### Task 6.2: Fills review shows single text block for message-reply

- **Location**: `src/lib/agent-runner.ts` (fills construction), `src/sidepanel/components/WorkflowMessage.svelte` (rendering)
- **Description**: For `message-reply` workflows, `buildFieldFills()` is not called; instead emit `AGENTIC_FILLS_REVIEW { kind: 'reply'; replyText: string }` using the discriminated union already defined in Task 1.5. No `types.ts` change needed here. `WorkflowMessage.svelte` renders the `kind === 'reply'` branch as a single `<pre>` or `<p>` block, not a field list.
- **Dependencies**: Tasks 1.5, 3.3, 5.2
- **Acceptance Criteria**: Payload discriminant (`kind`) matches what `WorkflowMessage.svelte` narrows on; `pnpm typecheck` passes with no cast or `as any`.
- **Validation**: `pnpm typecheck`.

---

### Task 6.3: Insert reply text into compose box on approval

- **Location**: `src/lib/agent-runner.ts` (apply step for message-reply), `src/content.ts` (new `INSERT_TEXT` message handler)
- **Description**: When fills-review gate resolves with `approved: true` for a `message-reply` workflow, background sends `INSERT_TEXT { text: string }` to the content script. Content script finds the focused or last-focused `contenteditable` / `textarea` on the page using `document.activeElement` or a platform-specific selector. Inserts via `document.execCommand('insertText', false, text)` with a fallback to `new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true })`.
- **Dependencies**: Tasks 3.3, 6.1–6.2
- **Acceptance Criteria**: Text is inserted without triggering auto-send; undo history preserved. If no compose box: content script returns `{ ok: false, reason: 'no-compose-box' }`.
- **Validation**: Manual test on WhatsApp Web + LinkedIn.

---

### Task 6.4: Error bubble when no compose box is detected

- **Location**: `src/sidepanel/tabs/WorkflowTab.svelte`
- **Description**: If `INSERT_TEXT` response returns `{ ok: false }`, emit an error `AgentThreadMessage` in the thread ("No compose box found — select the message input and try again") and do not emit `AGENTIC_SUMMARY`.
- **Dependencies**: Tasks 5.3, 6.3
- **Acceptance Criteria**: Thread stays interactive after this error (user can try again).
- **Validation**: Test on a non-messaging page.

---

### Task 6.5: Summary bubble shows word count for message-reply

- **Location**: `src/lib/agent-runner.ts`, `src/sidepanel/components/WorkflowMessage.svelte`
- **Description**: Extend `AGENTIC_SUMMARY` payload with optional `wordCount?: number`. When `taskType === 'message-reply'` and insertion succeeded, compute `replyText.trim().split(/\s+/).length` and include in the summary emission. `WorkflowMessage.svelte` renders it as "Message inserted (N words)".
- **Dependencies**: Tasks 6.3–6.4
- **Acceptance Criteria**: Word count only appears for `message-reply` runs where insertion succeeded.
- **Validation**: Summary bubble shows correct word count on WhatsApp Web test.

---

### Task 6.6: Add host permissions for WhatsApp Web and LinkedIn

- **Location**: `manifest.config.ts`
- **Description**: Add `'https://web.whatsapp.com/*'` and `'https://www.linkedin.com/*'` to `host_permissions` (already covered by `<all_urls>` for `fetch_url`, but explicit entries are cleaner for auditing and may be required for `scripting` permission). Verify extension reloads cleanly.
- **Dependencies**: Tasks 4.4, 6.3
- **Acceptance Criteria**: Manifest validates; extension loads without errors.
- **Validation**: `pnpm build`; reload extension at `chrome://extensions`.

---

## Sprint 7: Tests + Final Polish

**Goal**: All existing and new tests pass; `pnpm typecheck` is clean; `pnpm build` succeeds; no dead code remains.

**Demo/Validation**:

- `pnpm test` — zero failures.
- `pnpm typecheck` — zero errors.
- `pnpm build` — clean production bundle.
- Manual smoke test: full form-fill run + full message-reply run end-to-end.

---

### Task 7.1: Update background.spec.ts for new port name + routing

- **Location**: `src/__tests__/background.spec.ts`
- **Description**: Update any test that connects on port `'agent'` to use `'workflow'`. Add test cases for `AGENTIC_PLAN_FEEDBACK` and `AGENTIC_FILLS_FEEDBACK` routing. Remove `AGENTIC_APPLY` test cases.
- **Validation**: `pnpm test background.spec.ts`

---

### Task 7.2: Update content.spec.ts for EXTRACT_CONVERSATION + INSERT_TEXT

- **Location**: `src/__tests__/content.spec.ts`
- **Description**: Add test cases for the two new message handlers. Mock `extractConversation()` to return a known fixture; verify the response includes `messages` and `platform`. Mock `document.execCommand`; verify `INSERT_TEXT` handler calls it and returns `{ ok: true }`.
- **Validation**: `pnpm test content.spec.ts`

---

### Task 7.3: Update agent-store / workflow-store specs for new state shape

- **Location**: `src/sidepanel/__tests__/workflow-store.spec.ts`
- **Description**: Update all tests that reference `confirmFields` to use `agentMessages`. Add tests for `setPendingGate`, `clearThread`, and `planFeedbackCount` increment.
- **Validation**: `pnpm test workflow-store.spec.ts`

---

### Task 7.4: Update WorkflowTab spec for thread UI

- **Location**: `src/sidepanel/__tests__/workflow-tab.spec.ts`
- **Description**: Update/replace tests that assert on ConfirmTable rendering. Add tests for:
  - Thread renders `WorkflowMessage` components.
  - Feedback input shown when `pendingGate !== null`.
  - Approve sends `{ approved: true }` via port.
  - Submit with text sends `{ feedback: '...', approved: false }`.
  - Thread read-only after summary.
- **Validation**: `pnpm test workflow-tab.spec.ts`

---

### Task 7.5: Add WorkflowMessage.spec.ts

- **Location**: `src/sidepanel/components/WorkflowMessage.spec.ts` (new file)
- **Description**: Render each message variant and assert on key rendered elements (plan field names, fills values, summary counts, error text, reply text block).
- **Validation**: `pnpm test WorkflowMessage.spec.ts`

---

### Task 7.6: Full test suite + typecheck + build

- **Location**: project root
- **Description**: Run `pnpm typecheck && pnpm test && pnpm build`. Fix any remaining failures.
- **Dependencies**: All previous tasks
- **Acceptance Criteria**: All three commands exit 0.
- **Validation**: Terminal output.

---

## Testing Strategy

| Sprint | Primary validation method                                                      |
| ------ | ------------------------------------------------------------------------------ |
| 1      | `pnpm typecheck` + `pnpm test` (renamed files resolve)                         |
| 2      | `pnpm test pipeline.spec.ts` (CoT strip, retry, feedback in prompt)            |
| 3      | Mocked-port integration tests; manual DevTools port inspection                 |
| 4      | `pnpm test conversation-extractor.spec.ts`; manual test on WhatsApp + LinkedIn |
| 5      | Interactive manual test (full gate loop); updated store + tab specs            |
| 6      | Manual test on WhatsApp Web + LinkedIn + non-messaging page                    |
| 7      | `pnpm typecheck && pnpm test && pnpm build` — zero failures                    |

---

## Potential Risks & Gotchas

| Risk                                                                | Mitigation                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Small local models (llama3.2) ignore `<thinking>` instruction       | `stripThinking` returns raw string if no closing tag found; `parseWithRetry` handles total JSON failure                                     |
| Promise gate deadlock if port disconnects mid-run                   | `port.onDisconnect` rejects all pending gates via stored refs; AbortController propagates cancellation                                      |
| Plan feedback loop runs indefinitely                                | Hard cap at 5 iterations in Task 3.2; error message emitted on limit                                                                        |
| `AGENTIC_CONFIRM` removal breaks any code path still referencing it | Task 1.5 removes it from types.ts; TypeScript exhaustiveness check flags any surviving `case 'AGENTIC_CONFIRM'`                             |
| WhatsApp / LinkedIn DOM changes break extraction                    | Selectors isolated in `conversation-extractor.ts`; failure returns `[]` (pipeline continues with LLM noting missing context); easy to patch |
| `document.execCommand('insertText')` deprecated                     | Fallback to `InputEvent` with `insertText` data type; test on current Chrome Stable before shipping                                         |
| `message-reply` run on non-messaging page                           | `extractConversation()` returns `[]`; plan bubble explicitly notes "no conversation found"; user can still approve a from-scratch compose   |
| Duplicate spec files (e.g. `AgentTab.spec.ts` at two paths)         | Tasks 1.2 + 1.3 rename all spec files; grep for `AgentTab` after Sprint 1 to catch any stragglers                                           |
| `pendingGate` state desync if port message arrives out of order     | Process messages sequentially in the port `onMessage` handler; `pendingGate` is only set on review messages, cleared on summary/error       |

---

## Rollback Plan

- Each sprint is a separate logical commit (or small commit series). Rolling back to any sprint boundary restores a compile-clean state.
- Sprint 1 (rename) is purely mechanical — revert by `git revert` of the rename commits.
- The `AGENTIC_CONFIRM` / `AGENTIC_APPLY` path is removed in Sprint 3. If a rollback past Sprint 3 is needed, restore those message types in `types.ts` and re-add the `AGENTIC_APPLY` handler in `background.ts`.
- `conversation-extractor.ts` (Sprint 4) is additive-only — deleting the file and removing the `EXTRACT_CONVERSATION` case in `content.ts` fully reverts Sprint 4 with no side effects.
