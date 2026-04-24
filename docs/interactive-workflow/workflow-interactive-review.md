# PRD: Interactive Workflow Review, Smarter Planning & Messaging Composition

## 1. Executive Summary

**Problem Statement:**  
The current agent pipeline runs silently end-to-end, showing status dots and a final confirm table. Users have no meaningful opportunity to course-correct the plan before draft values are generated, and the fill-review step (ConfirmTable) requires editing raw fields rather than having a conversation. The extension is also limited to traditional HTML forms and cannot assist with composing messages on platforms like WhatsApp Web or LinkedIn.

**Proposed Solution:**  
Replace the Agent tab with a **Workflow tab** that renders a chat-like thread. The pipeline pauses at two gates — after planning and after drafting — emitting readable messages the user can approve or respond to in natural language. Simultaneously, improve `runPlan()` prompt quality using chain-of-thought, few-shot examples, and richer page context. Extend the content script to detect and extract visible conversation threads, enabling a new `message-reply` workflow type that reads the open conversation and composes a contextual reply using the user's profile and a chosen template.

**Success Criteria:**

- At least 70% of workflow runs are approved on the first plan presentation (zero feedback iterations needed), measured by tracking `planFeedbackCount` per run.
- At least 80% of fill reviews are approved on the first presentation, measured by `fillFeedbackCount` per run.
- JSON parse failures on `runPlan()` and `runDraft()` drop to < 2% of calls (vs. current silent failures).
- The Workflow tab renders the complete run thread (plan → fills → summary) within the same session without page reload.
- Message reply workflows correctly extract conversation context on WhatsApp Web and LinkedIn Messaging on first attempt in >= 90% of cases.
- All improvements remain compatible with Ollama (local) and OpenAI-compatible providers — no provider-specific APIs required.

---

## 2. User Experience & Functionality

### User Personas

**Primary — Power user, daily extension user:**  
Fills complex multi-section forms (job applications, onboarding flows) multiple times per week. Frustrated that the current pipeline produces drafts they can't preview before LLM costs are spent on draft/review stages. Wants to catch plan mistakes early.

**Secondary — Occasional user:**  
Uses the extension a few times a month for simpler contact or registration forms. Does not want friction; if the plan looks right, one click to approve and apply is the entire interaction.

**Tertiary — Communicator:**  
Actively uses WhatsApp Web and LinkedIn Messaging for professional outreach and relationship management. Wants to reply to conversations quickly and consistently using personal tone templates, without copying-and-pasting or writing from scratch each time.

---

### User Stories & Acceptance Criteria

**Story 1 — Rename Agent → Workflow**  
_As a user, I want the tab labeled "Workflow" so the mental model matches what the feature actually does._

- AC: The sidepanel tab previously labeled "Agent" is renamed to "Workflow" everywhere in the UI and codebase (tab label, store names, component file names, internal comments).
- AC: No functional behavior changes in this rename.

---

**Story 2 — Plan review gate**  
_As a user, I want to see the plan before draft values are generated so I can catch mistakes without wasting LLM calls._

- AC: After the plan stage completes, the pipeline pauses and emits the plan as a chat bubble in the Workflow thread. The bubble shows: task type, list of fields to fill, fields that will be skipped (missing from profile), tone, and any notes from the LLM.
- AC: A text input appears at the bottom of the thread labeled "Approve or tell me what to change…".
- AC: Typing a message and submitting re-runs only the plan stage with the feedback appended to the prompt; the updated plan appears as a new bubble in the thread.
- AC: Clicking "Approve" (or typing "approve") advances the pipeline to the draft stage.
- AC: There is no hard limit on plan feedback iterations; the user can loop as many times as needed.
- AC: Cancelling at the plan gate aborts the run cleanly with no fields applied.

---

**Story 3 — Fill review gate**  
_As a user, I want to see proposed field values as a readable list in the chat so I can approve or request corrections before anything is applied to the page._

- AC: After the draft (and optional review) stage completes, the pipeline pauses and emits the proposed fills as a chat bubble. The bubble renders each field as a two-line entry: field label and proposed value.
- AC: The same text input accepts natural language feedback (e.g., "make the bio shorter", "use my work email instead").
- AC: Submitting feedback re-runs the draft stage with the feedback appended; the revised fills appear as a new bubble.
- AC: Clicking "Approve" applies all fields to the page and closes the input.
- AC: After apply, the input disappears and a summary bubble is shown (see Story 4).

---

**Story 4 — Post-apply summary**  
_As a user, I want a summary of what was applied so I know the run is complete and what happened._

- AC: Summary bubble shows: number of fields applied, number skipped (and why — missing profile data vs. empty proposed value), and run duration.
- AC: The thread is read-only after the summary; no further input is possible for that run.
- AC: Starting a new run resets the thread entirely (no persistence across sessions or runs).

---

**Story 6 — Conversation extraction**  
_As a user on a messaging platform, I want the extension to read the visible conversation so it has context before composing a reply._

- AC: When a `message-reply` workflow is run, the background sends an `EXTRACT_CONVERSATION` message to the content script before the plan stage.
- AC: The content script attempts to extract visible messages from the active page using platform-specific selectors. Supported platforms at launch: WhatsApp Web (`https://web.whatsapp.com`) and LinkedIn Messaging (`https://www.linkedin.com/messaging`).
- AC: Each extracted message is typed as `{ sender: 'me' | 'them'; text: string }`. The content script returns an array of the most recent messages (up to 20) in chronological order.
- AC: If extraction fails or returns zero messages (unrecognised platform or DOM change), the pipeline continues with an empty context and the plan stage notes the missing context — it does not error out.
- AC: The extracted conversation is never stored; it is used only for the current run's LLM calls and discarded.

---

**Story 7 — Message reply workflow**  
_As a user, I want to select a messaging workflow, see a composed reply based on the open conversation and my profile, and approve or refine it before it is inserted into the compose box._

- AC: The workflow selector in the Workflow tab lists workflows with `taskType: 'message-reply'` alongside form workflows.
- AC: Running a message-reply workflow shows the same plan review gate as form workflows, but the plan bubble summarises the conversation context (who sent the last message, key topic) and the intended reply strategy (tone, key points to cover).
- AC: The fill review gate shows the full composed reply as a single text block, not a field list.
- AC: Approving the fill inserts the reply text into the focused compose box on the page using `document.execCommand('insertText')` or equivalent (to preserve undo history and trigger framework event listeners).
- AC: The summary bubble confirms the message was inserted and shows word count.
- AC: If no compose box is detected on the page when the user approves, an error message is shown in the thread and nothing is inserted.

---

**Story 5 — Smarter plan prompts**  
_As a user, I want the first plan the LLM produces to be correct more often so I rarely need to give feedback._

- AC: `runPlan()` prompts require the model to output a `<thinking>` block before the JSON. The parser strips the thinking block and only uses the JSON.
- AC: The plan system prompt includes 3 few-shot examples covering: a login/registration form, a contact/inquiry form, and a job application form.
- AC: The plan call receives the page title and a list of `{label, type, placeholder}` objects for each detected field (in addition to the existing `UnderstandOutput`).
- AC: If the plan JSON fails schema validation, one automatic retry is made with the parse error appended to the prompt. If the second attempt also fails, the pipeline emits an error stage.
- AC: The same CoT + few-shot + validation/retry pattern is applied to `runDraft()`.

---

### Non-Goals

- **Persistent conversation history** — the thread is in-memory only; closing the side panel or starting a new run clears it.
- **Streaming plan/draft tokens into the chat bubble** — messages appear fully-formed when the stage completes, not token-by-token.
- **Editing individual field values inline** — the ConfirmTable component is replaced entirely by the conversational fill review; there is no inline cell editing.
- **Voice input** — text only.
- **Multi-run comparison** — no diff view between iterations.
- **Auto-sending messages** — the extension inserts text into the compose box but never clicks Send. The user always sends manually.
- **Mobile messaging apps** — only web-based platforms (WhatsApp Web, LinkedIn Messaging) are in scope. Native Android/iOS apps are not.
- **Reading full conversation history** — only the messages visible in the current viewport (up to 20) are extracted. Scrollback is not fetched.

---

## 3. AI System Requirements

### Prompt Architecture — Chain-of-Thought Gate

All planning and drafting prompts follow this structure:

```
<system>
  [Role definition]
  [Constraints]
  [3 few-shot examples with <thinking> + JSON pairs]

  IMPORTANT: You MUST output a <thinking>...</thinking> block first,
  then output only valid JSON matching the schema. No other text.
</system>
<user>
  Page title: {pageTitle}
  Detected fields: {fieldsContext}
  Understand output: {understandOutput}
  [Optional: Previous plan + user feedback]
</user>
```

The `<thinking>` block is stripped by the parser before JSON extraction. If no JSON is found after stripping, the validation/retry path fires.

### Few-Shot Examples (plan stage)

Five archetypes to cover in the system prompt:

| Archetype            | Key signals                                                | Expected plan behavior                                               |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Login / registration | fields: email, password, confirm_password                  | Skip password fields (explicit allowlist); flag them as non-fillable |
| Contact / inquiry    | fields: name, email, message, subject                      | Fill all; tone from workflow config                                  |
| Job application      | fields: name, email, phone, linkedin, cover_letter         | Map to profile; flag phone if missing; use professional tone         |
| WhatsApp reply       | conversation thread; last message from `them`; compose box | Summarise context, draft concise reply matching user's casual tone   |
| LinkedIn reply       | conversation thread; last message from `them`; compose box | Summarise context, draft professional reply using user's headline    |

### Evaluation Strategy

- Track `planFeedbackCount` and `fillFeedbackCount` per run (in-memory, not persisted).
- A run with `planFeedbackCount === 0` is a "first-pass approval" — the target is ≥ 70% of runs.
- JSON parse failure rate is observable via the retry path: log a `console.warn` with the stage name on every retry so it is visible in the extension's service worker logs.

---

## 4. Technical Specifications

### Architecture Overview

```
User clicks Run
  ↓
Workflow tab → startRun() → Port: AGENTIC_RUN
  ↓
background.ts → runAgentPipeline()
  ↓
[Collect] → [Understand] → [Plan]
  ↓
emit AGENTIC_PLAN_REVIEW { plan: PlanOutput }
  ↓  ← pipeline suspended (Promise gate)
UI renders plan bubble + input
User types feedback or approves
  ↓
Port: AGENTIC_PLAN_FEEDBACK { feedback?: string, approved: boolean }
  ↓  → if feedback: re-run plan stage, loop
  ↓  → if approved: continue
[Draft] → [Review?]
  ↓
emit AGENTIC_FILLS_REVIEW { fills: FieldFill[] }
  ↓  ← pipeline suspended (Promise gate)
UI renders fills bubble + input
User types feedback or approves
  ↓
Port: AGENTIC_FILLS_FEEDBACK { feedback?: string, approved: boolean }
  ↓  → if feedback: re-run draft stage, loop
  ↓  → if approved: apply fields
background.ts → APPLY_FIELDS → content.ts
  ↓
emit AGENTIC_SUMMARY { applied, skipped, durationMs }
UI renders summary bubble, input removed
```

### New / Changed Message Types (`src/types.ts`)

| Message                  | Direction    | Payload                                                         |
| ------------------------ | ------------ | --------------------------------------------------------------- |
| `AGENTIC_PLAN_REVIEW`    | bg → UI      | `{ plan: PlanOutput }`                                          |
| `AGENTIC_PLAN_FEEDBACK`  | UI → bg      | `{ feedback?: string; approved: boolean }`                      |
| `AGENTIC_FILLS_REVIEW`   | bg → UI      | `{ fills: FieldFill[] }`                                        |
| `AGENTIC_FILLS_FEEDBACK` | UI → bg      | `{ feedback?: string; approved: boolean }`                      |
| `AGENTIC_SUMMARY`        | bg → UI      | `{ applied: number; skipped: number; durationMs: number }`      |
| `AGENTIC_CONFIRM`        | —            | **Removed** — replaced by `AGENTIC_FILLS_REVIEW`                |
| `EXTRACT_CONVERSATION`   | bg → content | `{}` — triggers conversation scrape on active tab               |
| `CONVERSATION_DATA`      | content → bg | `{ messages: ConversationMessage[]; platform: string \| null }` |

New shared type (`src/types.ts`):

```typescript
export interface ConversationMessage {
  sender: 'me' | 'them';
  text: string;
}
```

### Changed Files

| File                                              | Change                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                                    | Add 7 new message types; add `ConversationMessage` interface; remove `AGENTIC_CONFIRM`; add `PipelineStage = 'plan-review' \| 'fills-review'`; add `taskType: 'message-reply'`   |
| `src/lib/pipeline.ts`                             | `runPlan()` and `runDraft()` accept optional `feedback?` and `conversation?`; add CoT prompt structure; add 5 few-shot examples; add validation/retry                            |
| `src/lib/agent-runner.ts`                         | Add Promise gate after plan; add Promise gate after fills; add re-run loops; handle `message-reply` task type (skip field collect, use conversation context); remove old confirm |
| `src/lib/conversation-extractor.ts`               | **New** — `extractConversation(): ConversationMessage[]`; platform-specific selectors for WhatsApp Web and LinkedIn Messaging; returns empty array on unknown platform           |
| `src/content.ts`                                  | Handle `EXTRACT_CONVERSATION` message; call `extractConversation()`, reply with `CONVERSATION_DATA`                                                                              |
| `src/background.ts`                               | Route `AGENTIC_PLAN_FEEDBACK` and `AGENTIC_FILLS_FEEDBACK`; send `EXTRACT_CONVERSATION` to active tab for `message-reply` workflows                                              |
| `src/sidepanel/stores/agent.ts`                   | Replace `confirmFields` with `agentMessages[]` thread; add `pendingGate: 'plan' \| 'fills' \| null`; rename file to `workflow.ts`                                                |
| `src/sidepanel/tabs/AgentTab.svelte`              | **Renamed** to `WorkflowTab.svelte`; replace pipeline/confirm UI with thread + input                                                                                             |
| `src/sidepanel/components/ConfirmTable.svelte`    | **Removed** — replaced by message rendering in thread                                                                                                                            |
| `src/sidepanel/components/WorkflowMessage.svelte` | **New** — renders plan bubble, fills list, message reply preview, user feedback bubble, summary bubble                                                                           |

### Security & Privacy

- No conversation history is persisted to `chrome.storage` or sent off-device beyond the existing LLM provider calls.
- Feedback strings entered by the user are appended to the existing prompt chain — they are subject to the same provider routing as all other LLM calls (local Ollama by default).
- The `<thinking>` block is stripped before storage or logging; it is never written to Obsidian logs.

---

## 5. Risks & Roadmap

### Phased Rollout

**MVP (this PRD)**

- Rename Agent → Workflow tab.
- CoT + few-shot (5 archetypes) + richer context + validation/retry in `runPlan()` and `runDraft()`.
- Plan review gate with natural language feedback loop.
- Fill review gate with natural language feedback loop (single reply block for `message-reply` workflows).
- Post-apply summary bubble.
- Conversation extraction (`extractConversation()`) for WhatsApp Web and LinkedIn Messaging.
- `message-reply` workflow type: read conversation → compose reply → review gate → insert into compose box.

**v1.1 — Observability**

- Surface `planFeedbackCount` / `fillFeedbackCount` in the summary bubble so users can see how many iterations were needed.
- Add a "copy run summary" button to export the thread as plain text.
- Add `manifest.config.ts` host permission for any additional messaging platforms added in this phase.

**v2.0 — Adaptive few-shot**

- When a user provides feedback and approves a revised plan, optionally save that (form type → feedback → revised plan) pair as a new few-shot example for future runs on similar forms.
- Extend conversation extraction to additional platforms (Slack Web, Telegram Web) based on usage data.

### Technical Risks

| Risk                                                                        | Likelihood | Mitigation                                                                                                                                       |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Small local models ignore `<thinking>` instruction                          | Medium     | Parser falls back gracefully — if no `</thinking>` closing tag found, treat entire response as candidate JSON; retry path handles total failures |
| Promise gate deadlock if port disconnects mid-run                           | Low        | `port.onDisconnect` listener rejects all pending gates and cleans up the AbortController                                                         |
| Plan re-run loop runs indefinitely                                          | Low        | Cap plan feedback iterations at 5; on limit emit an error with a user-readable message                                                           |
| Removing `AGENTIC_CONFIRM` breaks existing `autoApply` workflow config flag | Medium     | `autoApply: true` workflows skip both gates and apply directly — preserve the flag, short-circuit both Promise gates when it is set              |
| WhatsApp Web or LinkedIn DOM changes break conversation extraction          | High       | Selectors isolated in `conversation-extractor.ts`; failure returns empty array (pipeline continues, LLM notes missing context); easy to patch    |
| `execCommand('insertText')` deprecated in some Chromium versions            | Medium     | Fall back to `InputEvent` with `insertText` data type; test on current Chrome stable before shipping                                             |
| `message-reply` workflow run on a non-messaging page                        | Low        | Extraction returns empty array; plan bubble explicitly notes "no conversation found"; user can still approve a from-scratch compose              |
