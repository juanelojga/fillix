# PRD: Agentic Form Filler — Fillix v2

**Status:** Draft · 2026-04-18

---

## 1. Executive Summary

### Problem Statement

Fillix has a side-panel chat interface connected to Ollama, but no structured way to act on the current page. Users who want to fill a form, draft a LinkedIn post, rewrite existing text, or answer fields one-by-one must either do it manually or prompt ad-hoc — losing consistency, auditability, and control.

### Proposed Solution

Introduce an **Agentic Filler** that lets users select a pre-defined multi-step workflow (stored in Obsidian markdown files), execute it against the current page via a local Ollama model, log every step to a dedicated Obsidian log file, and review the result in the side panel before anything is applied.

### Success Criteria

| KPI                                                                      | Target                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| Workflow execution end-to-end (detect → confirm) completes               | < 30s on a 10-field form with `gemma3:4b` |
| Field mapping accuracy (correct field gets correct value)                | ≥ 90% on standard HTML forms              |
| User-facing log entry written to Obsidian per step                       | 100% coverage — zero silent steps         |
| Workflow definition roundtrip (write in Obsidian → appear in side panel) | < 5s after file save                      |
| False-fill rate (filling a field the user didn't intend)                 | 0 — confirm step blocks all writes        |

---

## 2. User Experience & Functionality

### User Personas

**"Efficiency Marco"** — fills repetitive B2B forms (job applications, vendor onboarding, RFPs) 5+ times per week. Wants a workflow he can define once and reuse across dozens of sites without re-prompting.

**"Creator Leila"** — drafts LinkedIn posts and content rewrites. Wants a workflow that enforces her tone guide and sign-off pattern without her having to re-explain it every time.

---

### User Stories

#### Workflow Management

> **S1** · As a user, I want to store my workflows as Obsidian markdown files so that I can version, edit, and reuse them outside the browser.
>
> **Acceptance Criteria:**
>
> - Each `.md` file in a user-configured Obsidian vault folder is treated as one workflow definition.
> - The side panel lists all discovered workflows by filename (without extension).
> - Adding or editing a file is reflected in the side panel within 5 seconds of a page reload or manual refresh action.
> - A workflow file that fails to parse shows an inline error in the list (not a silent omission).

---

#### Page Detection & Context Collection

> **S2** · As a user, I want Fillix to automatically detect the type of task on the current page so that the agent selects the right strategy without me specifying it.
>
> **Acceptance Criteria:**
>
> - On workflow execution, the agent identifies page type from: `form` (≥1 fillable input), `linkedin-post` (LinkedIn compose URL or editor selector), `rich-text` (contenteditable with existing text), `unknown` (fallback).
> - Detected page type is shown in the side panel before the pipeline starts.
> - User can override the detected type via a dropdown before confirming execution.

> **S3** · As a user, I want the agent to collect all relevant form fields before generating content so that it can plan a complete fill rather than going field-by-field blindly.
>
> **Acceptance Criteria:**
>
> - Collected fields include: input `type`, `name`, `id`, `placeholder`, resolved label text, and current value (if any).
> - Fields of types `password`, `file`, `hidden`, `submit`, `checkbox`, `radio` are excluded by default (matching existing `FILLABLE_INPUT_TYPES` allowlist in `forms.ts`).
> - Collected context is shown in a collapsible "Detected Fields" section in the side panel.

---

#### Agentic Pipeline

> **S4** · As a user, I want the agentic pipeline to run in discrete, observable steps so that I can understand what the model decided and why.
>
> **Acceptance Criteria:**
>
> - The pipeline runs exactly these stages in order: **Understand → Collect → Plan → Draft → Review → Apply → Confirm**.
> - Each stage emits a status update to the side panel in real time (streaming preferred, polling acceptable).
> - Each stage is logged as a timestamped entry to the Obsidian log file before the next stage begins.
> - If any stage fails (model error, parse error, Obsidian write error), the pipeline halts and displays the error in the side panel — it does not skip to the next stage.

> **S5** · As a user, I want the Review stage to run a second Ollama pass over the Draft so that I receive a quality-checked version, not a raw first generation.
>
> **Acceptance Criteria:**
>
> - Review prompt instructs the model to check: clarity, accuracy vs. profile data, missing required fields, unsafe/false claims, and platform tone fit.
> - Review output is a revised draft (not a separate critique document).
> - If the Review output is identical to the Draft within a configurable similarity threshold, the stage is marked "no changes" rather than re-displaying the same text.

---

#### Confirm & Apply

> **S6** · As a user, I want to see a diff/preview of all proposed field values before anything is written to the page so that I have final control over what gets submitted.
>
> **Acceptance Criteria:**
>
> - Confirm step shows a table: Field Label | Current Value | Proposed Value.
> - User can edit any proposed value inline in the side panel before applying.
> - "Apply" writes values field-by-field via `setFieldValue` (dispatches `input`/`change` events — existing behavior in `forms.ts`).
> - "Cancel" at this step writes nothing to the page.
> - After apply, a "Completed" summary is shown in the side panel listing fields written.

---

#### Obsidian Logging

> **S7** · As a user, I want every pipeline execution logged to a dedicated Obsidian file so that I can audit what the model did and replay or debug workflows.
>
> **Acceptance Criteria:**
>
> - Log file path is user-configurable (default: `fillix-logs/YYYY-MM-DD.md`).
> - Each execution appends a new `## Run — <ISO timestamp>` section.
> - Each pipeline stage appends a sub-entry: stage name, duration (ms), and a one-line summary of output (not the full generated text, to keep logs readable).
> - Full Draft and Review outputs are written under a collapsible `<details>` block in the log entry.
> - Log writes use the existing Obsidian integration path; failure to write does **not** abort the pipeline (log errors surface in the side panel as a non-blocking warning).

---

### Non-Goals (v1)

- **No cloud LLM fallback.** All inference stays on Ollama. Privacy model is unchanged.
- **No automatic workflow selection.** The user always chooses the workflow; the agent only auto-detects page _type_.
- **No form submission.** Fillix fills fields; it never clicks Submit/Send on the user's behalf.
- **No workflow editor inside the extension.** Workflows are authored in Obsidian. The extension is read-only for workflow definitions.
- **No multi-tab orchestration.** One workflow execution per active tab at a time.
- **No checkbox/radio/file field filling.** These remain excluded (existing `FILLABLE_INPUT_TYPES` constraint).

---

## 3. Workflow Definition Format (Obsidian)

Each workflow is a markdown file. The extension reads YAML frontmatter for machine-readable config and uses the markdown body as the system prompt passed to the **Understand** and **Plan** stages.

### Minimal valid workflow file

```markdown
---
name: Job Application
task_type: form # form | linkedin-post | rewrite | field-by-field
tone: professional
required_profile_fields:
  - name
  - email
  - experience_years
review: true # whether to run the Review stage
---

You are filling a job application on behalf of the user.
Prioritise conciseness. Never invent credentials the user has not listed.
If a field cannot be filled confidently, leave it blank and note it.
```

### Extended fields (optional)

| Key                       | Type     | Default        | Description                                                      |
| ------------------------- | -------- | -------------- | ---------------------------------------------------------------- |
| `task_type`               | enum     | `form`         | Controls Understand stage strategy                               |
| `tone`                    | string   | `professional` | Appended to every generation prompt                              |
| `required_profile_fields` | string[] | `[]`           | Validates profile completeness before starting; warns if missing |
| `review`                  | bool     | `true`         | Whether to run the second-pass Review stage                      |
| `log_full_output`         | bool     | `true`         | Whether full draft/review text appears in Obsidian log           |
| `auto_apply`              | bool     | `false`        | Skip the Confirm step and apply immediately — opt-in only        |

---

## 4. AI System Requirements

### Model Requirements

- **Minimum capability:** Ollama model with structured output (`format: 'json'`) support and tool/function calling. `gemma3:4b` (Gemma 4) is the documented default.
- **Context window:** ≥ 8k tokens to hold page context + profile + pipeline history in a single request.
- **Agentic loop:** Each pipeline stage is a separate `POST /api/generate` call (stateless). The background service worker assembles context and passes it forward.

### Stage Prompts (Contracts)

Each stage returns a typed JSON envelope. TypeScript exhaustiveness checking (already in `types.ts`) must cover all stage response shapes.

| Stage          | Input                                 | Expected JSON Output                                  |
| -------------- | ------------------------------------- | ----------------------------------------------------- |
| **Understand** | page snapshot, workflow system prompt | `{ task_type, detected_fields[], confidence }`        |
| **Plan**       | Understand output + profile           | `{ fields_to_fill[], missing_fields[], tone, notes }` |
| **Draft**      | Plan output                           | `{ field_id: value }[]`                               |
| **Review**     | Draft output + Plan constraints       | `{ field_id: revised_value, change_reason? }[]`       |

If any response fails JSON parse, the stage fails (existing `ollama.ts` parse-fail behavior — return empty string, never hallucinated text).

### Evaluation Strategy

- **Offline fixture tests:** 3 static HTML form snapshots (job application, contact form, LinkedIn compose). Run each workflow definition through a headless Ollama call; assert field mapping matches a fixture answer key.
- **Pass threshold:** ≥ 9/10 fields correctly mapped per fixture to ship.
- **Review stage delta:** Measure edit distance between Draft and Review outputs across 20 test runs; flag if Review makes zero changes more than 40% of the time (suggests prompt needs tuning).

---

## 5. Technical Specifications

### Architecture Overview

```
Side Panel (sidepanel.ts)
  │  user selects workflow + clicks "Run"
  │
  ▼
content.ts
  │  snapshots page fields (detectFields → field metadata array)
  │  sends AGENTIC_RUN message
  │
  ▼
background.ts  ─── pipeline orchestrator
  │  Stage loop: Understand → Collect → Plan → Draft → Review
  │  streams stage status back to side panel via chrome.runtime.sendMessage
  │  writes each stage log entry to Obsidian (OBSIDIAN_APPEND message)
  │
  ▼
ollama.ts
  │  POST /api/generate per stage (structured JSON output)
  │
  ▼
background.ts
  │  sends AGENTIC_CONFIRM with proposed field map
  │
  ▼
Side Panel
  │  user reviews diff table, edits inline, clicks Apply
  │
  ▼
content.ts
  │  setFieldValue per field (existing impl in forms.ts)
  │
  ▼
background.ts
  │  writes completion log entry to Obsidian
  │  sends AGENTIC_COMPLETE to side panel
```

### New Message Types (extends `types.ts`)

```typescript
// Outbound: side panel → background
| { type: 'AGENTIC_RUN'; workflowId: string; fields: FieldSnapshot[] }
| { type: 'AGENTIC_APPLY'; fieldMap: FieldFill[] }

// Inbound: background → side panel (streamed progress)
| { type: 'AGENTIC_STAGE'; stage: PipelineStage; status: 'running' | 'done' | 'error'; summary?: string }
| { type: 'AGENTIC_CONFIRM'; proposed: FieldFill[]; logEntryId: string }
| { type: 'AGENTIC_COMPLETE'; applied: FieldFill[]; logPath: string }
```

### Workflow Discovery (Obsidian Integration)

- Background reads the Obsidian vault directory (existing integration path) on extension load and on `OBSIDIAN_REFRESH` message.
- Scans for `*.md` files that contain valid YAML frontmatter with at minimum a `name` field.
- Workflow list is stored in `chrome.storage.local` under key `workflows[]` (not synced — local vault path is machine-specific).

### Integration Points

| System                    | Use                               | Notes                                                   |
| ------------------------- | --------------------------------- | ------------------------------------------------------- |
| Ollama `/api/generate`    | Per-stage LLM calls               | Existing `ollama.ts` client; add `system` param support |
| Ollama `/api/tags`        | Model capability check on startup | Warn if selected model lacks tool-call support          |
| Obsidian vault (local FS) | Workflow definitions + log writes | Existing integration; add append-to-file operation      |
| `chrome.storage.local`    | Cached workflow list, run history | New keys: `workflows`, `agenticRunLog`                  |

### Security & Privacy

- No field data, page content, or profile data leaves `localhost`. Privacy model unchanged.
- `auto_apply: true` (skip confirm) is an explicit opt-in in the workflow file — it must not be the default and must display a warning on first use.
- Sensitive field types (`password`, `file`, `hidden`) remain permanently excluded from the field snapshot sent to Ollama.
- Obsidian log entries must redact any value matching the pattern of a password, token, or credential (regex allowlist, not content analysis).

---

## 6. Risks & Roadmap

### Technical Risks

| Risk                                                       | Likelihood | Mitigation                                                                                                          |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Model produces invalid JSON mid-pipeline                   | Medium     | Existing parse-fail guard in `ollama.ts`; stage halts, error shown in panel                                         |
| Ollama context window overflow on large forms (>20 fields) | Medium     | Field snapshot truncation: send label + type only (not current value) when field count > 15                         |
| Obsidian write latency blocks pipeline                     | Low        | Log writes are fire-and-forget; pipeline does not await log confirmation                                            |
| `gemma3:4b` tool-call reliability on complex workflows     | Medium     | Fallback to structured JSON prompt (no native tool calls) if model ID doesn't match known tool-capable list         |
| User edits workflow file mid-run                           | Low        | Lock workflow definition at run start (snapshot frontmatter into run context); file changes take effect on next run |

---

### Phased Roadmap

#### MVP — Agentic Filler v1

- Workflow file discovery from Obsidian vault
- Side panel workflow selector
- Pipeline stages: Understand → Collect → Plan → Draft → Review
- Confirm diff table in side panel
- Apply via `setFieldValue`
- Obsidian log file writes
- Supported task types: `form`, `field-by-field`

#### v1.1 — Content Creation Modes

- `linkedin-post` task type (detects LinkedIn compose UI, maps to single rich-text field)
- `rewrite` task type (highlights selected text, rewrites in place)
- Inline editing in the Confirm table

#### v2.0 — Workflow Intelligence

- `auto_apply` confirm-skip mode (opt-in, warning on first use)
- Multi-workflow chaining (run workflow B after workflow A completes)
- Workflow analytics: success rate, avg field accuracy, avg run time in Obsidian log summary

---

_This document is the deliverable. Implementation planning begins in a separate session._
