# Agentic Filler — Usage Guide

## Overview

The **Agentic Filler** replaces the one-shot "Fillix: fill" button with a deliberate, multi-stage pipeline that gives you full control before anything is written to a page. Instead of firing a prompt per field instantly, it runs five Ollama stages in sequence — Collect → Understand → Plan → Draft → Review — then presents you with a confirm diff table where you can edit any proposed value before applying.

**When to use the Agent tab instead of the legacy fill button:**

| Situation                                           | Use                |
| --------------------------------------------------- | ------------------ |
| Long or complex form (job application, onboarding)  | Agent tab          |
| You want to see and edit proposed values first      | Agent tab          |
| Form is sensitive (e.g., cover letter, profile bio) | Agent tab          |
| Quick single-field or simple contact form           | Legacy fill button |
| You need instant fill with no review step           | Legacy fill button |

All inference runs locally via Ollama. No data leaves your machine.

---

## Prerequisites

Before using the Agentic Filler, ensure the following are in place:

1. **Ollama is running** with at least one model that supports JSON-format output (e.g. `gemma3:4b`, `llama3.2`, `mistral`).
2. **`OLLAMA_ORIGINS` is set** to `chrome-extension://*` in the environment Ollama runs under — otherwise every pipeline stage request will be rejected.
   - macOS: `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart Ollama
   - Linux: add `Environment=OLLAMA_ORIGINS=chrome-extension://*` to the Ollama systemd unit
3. **Obsidian Local REST API plugin** is installed and running in your vault. The plugin provides the API that Fillix uses to discover workflow files and write run logs. Get it from Obsidian's community plugins; enable it and copy the API key.
4. **Obsidian API key is configured** in the Fillix popup (toolbar icon → Obsidian section).
5. **At least one workflow `.md` file** exists in the configured vault folder (see Setup below).

---

## Initial Setup

### Step 1 — Configure the workflows folder

The workflows folder is where Fillix looks for `.md` workflow definition files inside your Obsidian vault.

**Via the toolbar popup:**

1. Click the Fillix icon in the Chrome toolbar.
2. Find the **Agent** section.
3. Set **Workflows folder** (default: `fillix-workflows`).
4. Click **Save**.

**Via the side panel:**

1. Open the Fillix side panel (right-click the Fillix icon → "Open side panel", or use the keyboard shortcut).
2. Click the **Settings** tab.
3. Set **Workflows folder** and save.

The folder path is relative to your vault root. For example, if your vault is at `~/Documents/MyVault` and the setting is `fillix-workflows`, Fillix will scan `~/Documents/MyVault/fillix-workflows/`.

### Step 2 — Create the vault folder

In Obsidian, create a new folder at the path you configured. You can do this from the file explorer pane (right-click → New folder).

### Step 3 — Create your first workflow file

See the [Authoring Workflow Files](#authoring-workflow-files) section below for the full format and examples. Place the `.md` file inside the folder you created.

### Step 4 — Load workflows into the extension

Open the side panel → **Agent** tab → click the **↺** (Refresh) button next to the dropdown. Fillix fetches all `.md` files from the configured vault folder, parses them, and stores the results locally. The dropdown populates immediately.

Workflows are also refreshed automatically each time the extension loads (if Obsidian is reachable). A failed auto-refresh is silently logged to the background console — it never surfaces as an error to the user.

---

## Authoring Workflow Files

A workflow file is a Markdown document with **YAML frontmatter** at the top and a **system prompt** in the body. The frontmatter configures pipeline behaviour; the body is sent to the model as context on every stage.

### File format

```markdown
---
name: My Workflow Name
task_type: form
tone: professional
required_profile_fields:
  - full_name
  - email
review: true
log_full_output: true
auto_apply: false
---

You are a helpful assistant filling out web forms on behalf of the user.
Always use information from the user's profile. Never invent data.
Be concise. Prefer clear, direct language.
```

The file must be saved in the configured vault folder. The filename is used as the workflow's internal ID — renaming a file is equivalent to creating a new workflow entry.

---

### YAML Field Reference

| Field                     | Type     | Default        | Description                                                                                                                                                                                   |
| ------------------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                    | string   | **required**   | Display name shown in the side panel dropdown.                                                                                                                                                |
| `task_type`               | enum     | `form`         | Sets the pipeline's overall goal. Options: `form`, `field-by-field`, `linkedin-post`, `rewrite`.                                                                                              |
| `tone`                    | string   | `professional` | Tone instruction appended to every generation prompt. Free text — e.g. `"friendly and concise"`, `"formal, third person"`.                                                                    |
| `required_profile_fields` | string[] | `[]`           | Profile fields that must be populated. If any are missing when the pipeline runs, the Plan stage flags them in `missing_fields` and the stage summary lists them. The run still proceeds.     |
| `review`                  | bool     | `true`         | Whether to run the **Review** stage. Set to `false` to skip the second-pass quality check and go straight to the confirm table after Draft. Saves ~1–2 seconds per run.                       |
| `log_full_output`         | bool     | `true`         | Whether to append full JSON stage output to the Obsidian log (wrapped in a collapsible `<details>` block). Set to `false` to keep logs compact.                                               |
| `auto_apply`              | bool     | `false`        | If `true`, the confirm diff table is skipped and values are applied to the page immediately after Review (or Draft, if `review: false`). Use with caution on forms with irreversible actions. |

**Notes on `task_type`:**

- `form` — general-purpose form filling. The model plans which fields to fill based on the detected field list and your profile.
- `field-by-field` — like `form` but prompts the model to explain the strategy for each field individually in the Plan stage, which can improve quality on complex forms.
- `linkedin-post` — optimised for generating or rewriting LinkedIn post content rather than filling input fields.
- `rewrite` — instructs the model to rewrite existing field values rather than fill empty ones. Useful for editing a draft cover letter already in a textarea.

---

### Example Workflow Files

#### Example 1 — Job Application Form

Save as `fillix-workflows/job-application.md`:

```markdown
---
name: Job Application
task_type: form
tone: professional and confident
required_profile_fields:
  - full_name
  - email
  - phone
  - linkedin_url
  - years_experience
  - current_role
  - skills
review: true
log_full_output: true
auto_apply: false
---

You are filling out a job application form on behalf of the user.

Rules:

- Use only information from the user's profile. Never invent qualifications, companies, or dates.
- For cover letter or "Why do you want to work here?" fields, write 2–3 sentences max that reference the role and the user's most relevant experience.
- For salary fields, leave blank unless the profile contains an explicit salary expectation.
- Never fill password, file upload, or CAPTCHA fields.
- Prefer first-person voice ("I have five years of experience...").
```

#### Example 2 — LinkedIn Post Generator

Save as `fillix-workflows/linkedin-post.md`:

```markdown
---
name: LinkedIn Post
task_type: linkedin-post
tone: engaging, first-person, conversational
required_profile_fields:
  - full_name
  - current_role
  - industry
review: true
log_full_output: false
auto_apply: false
---

You are generating a LinkedIn post for the user.

Guidelines:

- Open with a hook sentence — a question, a bold claim, or a short story.
- Keep the post under 200 words.
- End with a question or call-to-action to encourage engagement.
- Do not use hashtags unless the user's profile explicitly lists preferred hashtags.
- Write in first person. Match the tone: engaging, conversational, and professional.
- Do not fabricate statistics or quotes.
```

#### Example 3 — Quick Contact Form (no review, no logging)

Save as `fillix-workflows/quick-contact.md`:

```markdown
---
name: Quick Contact Form
task_type: form
tone: friendly
required_profile_fields:
  - full_name
  - email
review: false
log_full_output: false
auto_apply: false
---

Fill in basic contact form fields — name, email, phone, company — using the user's profile.
Keep all values short and accurate. Do not compose messages or fill open-ended text fields.
```

---

## Loading and Refreshing Workflows

Fillix caches workflow definitions in `chrome.storage.local`. This means:

- **On extension load**: workflows are automatically refreshed if Obsidian is reachable.
- **After editing a workflow in Obsidian**: click the **↺** button in the Agent tab to force a fresh fetch. The dropdown updates immediately.
- **After adding a new workflow file**: same — click Refresh.
- **If Obsidian is unreachable on load**: the cached list from the last successful refresh is used. No error is shown; a warning is printed to the background service worker console.

To inspect the cached workflows directly: DevTools → Application → chrome.storage.local → `workflows` key.

---

## Running the Agent — Step by Step

1. **Navigate to the target page.** Make sure the form or content area is loaded and visible. The content script must be injected (it runs on all regular `http://` and `https://` pages; it does not run on `chrome://` or `chrome-extension://` pages).

2. **Open the Fillix side panel.** Right-click the Fillix toolbar icon → "Open side panel", or use the Chrome side panel keyboard shortcut.

3. **Click the Agent tab.** The workflow dropdown is populated from the cached list.

4. **Select a workflow** from the dropdown. The **Run** button becomes active.

5. **Click Run.** The pipeline starts immediately. The stage list becomes visible:

   ```
   ○ Collect
   ○ Understand
   ○ Plan
   ○ Draft
   ○ Review
   ```

   Each stage indicator shows its state:
   - Blue / animated: currently running
   - Green: completed (with elapsed time, e.g. "✓ Understand (1.2s)")
   - Red: error (error message shown inline)

6. **Wait for the pipeline to complete.** Depending on your Ollama model and hardware, each stage typically takes 0.5–3 seconds. The full pipeline (with Review) takes 5–12 seconds on mid-range hardware.

7. **Review the confirm diff table.** After the last stage completes, the table appears:

   | Field        | Current   | Proposed                 |
   | ------------ | --------- | ------------------------ |
   | First name   | _(empty)_ | Juan                     |
   | Email        | _(empty)_ | juan@example.com         |
   | Cover letter | _(empty)_ | I am excited to apply... |
   - The **Current** column shows the live value on the page at the time Collect ran.
   - The **Proposed** column is an editable `<input>`. Click any cell and type to override the proposed value.

8. **Edit any values** you want to change. Your edits are used instead of the model's proposal — the original proposal is not modified.

9. **Click Apply** to write all values to the page. The extension calls `setFieldValue` on each matched element, dispatching `input` and `change` events so React, Vue, and Angular form state updates correctly.

10. **The side panel shows the completion summary**: "Completed: 8 fields applied". The Obsidian log is updated (fire-and-forget; a log failure does not affect the fill result).

11. **Click Cancel** at any point during the confirm step to discard the proposals and return to the workflow selector. No fields are written to the page.

---

## The 5-Stage Pipeline in Detail

### Collect

The extension sends a `DETECT_FIELDS` message to the active tab's content script. The content script scans the page DOM and returns a serializable snapshot of every fillable field:

- Included types: `text`, `email`, `tel`, `url`, `number`, `search`, `date`, `time`, `month`, `week`, `datetime-local`, `color`, `range`, `textarea`, `select`
- Excluded types: `password`, `file`, `hidden`, `checkbox`, `radio`, `submit`, `button`, `image`, `reset`
- Label resolution order: `<label for="...">` → wrapping `<label>` → `aria-label` → `aria-labelledby` → `placeholder` → field `name` attribute

Each snapshot includes: `id`, `name`, `label`, `placeholder`, `type`, `autocomplete`, and `currentValue`.

**Context window guard:** if more than 15 fields are found, only `label` and `type` are forwarded to subsequent Ollama stages (not `currentValue` or `placeholder`). This keeps prompts within the 8k token budget of most local models.

### Understand

The model analyses the field list and page URL to classify:

- `task_type` — what kind of form this is (matches your `task_type` frontmatter setting)
- `detected_fields` — which field IDs are relevant to fill
- `confidence` — a 0–1 score; low confidence (< 0.5) is shown in the stage summary

Output used by: Plan stage.

### Plan

The model maps your Obsidian profile fields to the detected form fields and produces:

- `fields_to_fill` — array of `{ field_id, strategy }` pairs (e.g. `{ field_id: "cover_letter", strategy: "compose 2-sentence summary from work history" }`)
- `missing_fields` — profile fields listed in `required_profile_fields` that are absent from storage
- `tone` — confirmed tone for this run (echoes the `tone` frontmatter setting)
- `notes` — free-form model notes (shown in the stage summary)

Profile text is capped at 2000 characters before being sent to the model.

Output used by: Draft stage.

### Draft

The model writes the first-pass value for each field in `fields_to_fill`. Returns a flat JSON object:

```json
{
  "first_name": "Juan",
  "email": "juan@example.com",
  "cover_letter": "I am excited to apply for the Senior Engineer role..."
}
```

The model is instructed never to invent data not present in the profile, never to fill `password` or `file` fields, and to match the configured tone.

### Review

_(Skipped if `review: false` in frontmatter)_

The model receives the Draft output and the Plan, and performs a second-pass quality check — correcting tone, trimming verbosity, fixing awkward phrasing. Returns:

```json
{
  "first_name": { "revised_value": "Juan", "change_reason": null },
  "cover_letter": {
    "revised_value": "I'm excited to apply...",
    "change_reason": "Shortened; made more direct"
  }
}
```

If the review output for a field is identical to the draft, `change_reason` is `null`.

---

## The Confirm Diff Table

The confirm table is the final checkpoint before any values are written to the page.

### Editing proposals

Click any cell in the **Proposed** column to edit the value. The input is pre-filled with the model's proposal. Type your replacement value — it is not saved until you click Apply.

If you clear an input (empty string), that field is still included in the apply operation with an empty value. To skip a field entirely, you cannot currently deselect rows — instead, edit its proposed value to match the current value.

### Apply

Clicking **Apply** reads the current content of every input in the Proposed column:

- If the input value differs from the original proposal → your `editedValue` is applied
- If the input value is unchanged → the model's `proposedValue` is applied

The content script uses `document.getElementById(fieldId)` first, then `document.querySelector('[name="fieldId"]')` as a fallback.

### Cancel

Clicking **Cancel** sends `AGENTIC_CANCEL` to the background, disconnects the port, and resets the Agent tab to the workflow selector. Nothing is written to the page.

---

## Obsidian Logging

Every pipeline run appends an entry to a daily log file in your vault:

**Path:** `fillix-logs/YYYY-MM-DD.md`

One file is created per calendar day. Multiple runs on the same day are appended to the same file. If the file does not exist, it is created automatically.

### Log entry format

````markdown
## Run — 2026-04-20T15:23:45.123Z

**Workflow:** Job Application
**Page:** https://example.com/careers/apply

### Stage: collect (245ms)

Found 12 form fields

### Stage: understand (1203ms)

Task: form, 12 fields detected, confidence 0.92

### Stage: plan (891ms)

8 fields to fill, 3 missing: phone, linkedin_url, years_experience

### Stage: draft (1456ms)

8 values drafted

<details><summary>Full output</summary>

```json
{
  "first_name": "Juan",
  "email": "juan@example.com",
  "cover_letter": "I am excited to apply..."
}
```
````

</details>

### Stage: review (1123ms)

8 values reviewed, 2 revised

**Applied:** 8 field(s)

```

### Secret redaction

Before any content is written to the log, the following pattern is automatically replaced with `[REDACTED]`:

```

password: somevalue → password: [REDACTED]
token=abc123 → token=[REDACTED]
bearer eyJhb... → bearer [REDACTED]

```

This applies to any value adjacent to the keywords `password`, `token`, `secret`, `key`, or `bearer` (case-insensitive).

### Disabling full output

Set `log_full_output: false` in the workflow frontmatter. The `<details>` blocks are omitted; only the one-line stage summary is logged.

### Log write failures

Log writes are fire-and-forget: a failure to reach the Obsidian API does not halt the pipeline or prevent fields from being applied. A `console.warn` is emitted in the background service worker if the write fails.

---

## Settings Reference

### Workflows folder

**Where:** Popup → Agent section, or side panel Settings tab.
**Key:** `workflowsFolder` in `chrome.storage.local`.
**Default:** `fillix-workflows`.

The path is relative to the vault root. Subdirectories are not recursively scanned — only `.md` files directly inside the configured folder are loaded.

### Auto-refresh on extension load

When the extension starts (install or browser restart), it checks if an Obsidian API key is configured. If so, it automatically calls the workflow refresh logic. This keeps the dropdown up to date without requiring a manual click after Chrome restarts.

If Obsidian is unreachable (e.g., Obsidian is not running), the auto-refresh fails silently. The cached workflow list from the previous successful refresh is used.

### Other settings

All other settings (Ollama base URL, Ollama model, Obsidian base URL, Obsidian API key, user profile) are unchanged from the base Fillix configuration. See the popup for details.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Workflow dropdown is empty | Vault folder not found, no `.md` files, or Obsidian API unreachable | Verify folder name in settings matches the vault folder exactly; ensure Obsidian REST API plugin is running; click Refresh |
| "No form detected on this page" error at Collect | Content script not injected (e.g. `chrome://`, `chrome-extension://`, or a PDF page) | Navigate to a regular `https://` page; reload the tab if needed |
| Pipeline halts at Collect with no error | Page has no fillable input fields | Check that the form is fully loaded before running; scroll the page so the form is in the DOM |
| Stage error: "JSON parse failed" | Ollama returned non-JSON or a partial response | Ensure your model supports `format: json` (e.g. `gemma3:4b`); some small models ignore the format flag — try a different model |
| Stage error at Understand/Plan/Draft/Review | Ollama timed out or returned an error | Check `ollama serve` output; confirm the model is fully loaded (`ollama run <model>` in a terminal first) |
| Applied: 0 | Field IDs changed between Collect and Apply (e.g. a React re-render reassigned IDs) | Do not interact with the page between Run and Apply; re-run the pipeline if the page re-rendered |
| Some fields not filled | Field uses a non-standard element (custom web component, canvas-based input) | The content script only fills native HTML form elements; custom components are not supported in v1 |
| Obsidian log not created | Obsidian Local REST API unreachable at log-write time | Log writes are non-blocking; verify the API plugin is running and the API key is correct; the fill still succeeded |
| Workflow not in dropdown after editing in Obsidian | The cached workflow list is stale | Click ↺ Refresh in the Agent tab |
| `required_profile_fields` warning not shown | Field name does not exactly match a key in your stored profile | Check the profile in the popup; `required_profile_fields` entries are matched case-sensitively against profile keys |

---

## Known Limitations (v1)

- **One pipeline per tab at a time.** Starting a second `AGENTIC_RUN` on the same port cancels the first. If you want to run pipelines on two tabs simultaneously, open two side panels in two windows.

- **`appendToFile` is read-then-write.** There is no file lock. If two pipelines finish at the same time (unlikely — they share the same port), their log entries could overwrite each other. This is a known v1 limitation.

- **`auto_apply: true` skips the confirm step.** Values are written immediately after the Review (or Draft) stage completes. Use this only for low-stakes forms where you trust the model output. It cannot be undone by the extension once applied.

- **Large forms (> 15 fields).** When more than 15 fields are detected, only `label` and `type` are sent to Ollama — not `currentValue`, `placeholder`, or `autocomplete`. This is intentional (context window budget), but it means the model cannot see what is already filled in. Re-running after partially filling a form will still propose values for already-filled fields.

- **Profile text is capped at 2000 characters.** If your Obsidian profile note is long, only the first 2000 characters are used as context in the Plan stage. Keep the most important profile fields near the top of the note.

- **Content script does not run on browser-internal pages.** `chrome://`, `chrome-extension://`, `about:`, and PDF viewer pages are excluded by the extension manifest. Attempting to run the Agent on these pages produces a "No form detected" error.
```
