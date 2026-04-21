---
title: Gate 6 — Code Review
gate: 6
skill: /code-reviewer
---

# Gate 6: Code Review

## Purpose

Apply the project's full code review checklist to all code produced in Gate 4. This gate catches issues that typecheck does not — security vulnerabilities, performance traps, correctness bugs, and maintainability debt.

## Procedure

1. Announce: "Starting Gate 6: Code Review. Invoking `/code-reviewer` skill."
2. Invoke the `/code-reviewer` skill on all files modified in Gate 4.
3. Follow the reviewer's priority order: Security → Performance → Correctness → Maintainability.
4. Apply the full checklist below (reproduced from `code-reviewer/AGENTS.md` for context resilience):

### Security (CRITICAL — check every item)

- [ ] No `innerHTML`, `eval`, or `new Function` with page-sourced data in content scripts
- [ ] `CSS.escape()` used for dynamic CSS selectors built from DOM attributes
- [ ] `sender.id === chrome.runtime.id` verified in every new `chrome.runtime.onMessage` listener
- [ ] No hardcoded secrets, API keys, or tokens
- [ ] New `host_permissions` entries are justified by the plan

### Performance (HIGH)

- [ ] No `await chrome.runtime.sendMessage` inside `for` loops — use `Promise.all`
- [ ] All new `fetch` calls include `signal: AbortSignal.timeout(n)`
- [ ] Content script does no heavy work or storage reads on page load

### Correctness (HIGH)

- [ ] Every async `onMessage` listener has `return true` synchronously
- [ ] `JSON.parse` on external/Ollama data is validated at runtime, not just cast
- [ ] `if (!res.ok)` checked after every `fetch` call
- [ ] New message kinds added to both `Message` and `MessageResponse` in `types.ts`
- [ ] Every `switch (msg.type)` has `default: { const _: never = msg }` exhaustiveness guard

### Maintainability (MEDIUM)

- [ ] No single-letter or abbreviated names in exported types/functions
- [ ] Boolean names start with `is`, `has`, or `can`
- [ ] Message type literals are `SCREAMING_SNAKE_CASE`
- [ ] No `data` or `result` as variable names when something more descriptive fits

5. Output review using the structured format:

   ```
   ## Critical Issues 🔴 (N found)
   ## High Priority 🟠 (N found)
   ## Medium Priority 🟡 (N found)
   ## Summary
   ```

6. Fix **every** issue found at any severity level (CRITICAL, HIGH, MEDIUM):
   - Do not skip or defer any finding — fix it immediately.
   - After fixing: re-run `pnpm typecheck` to confirm fixes didn't break types.
   - Re-run this gate's checklist on the changed files.
   - Repeat until the checklist passes with zero findings at all severity levels.
7. When the checklist is fully clean:
   - Edit `docs/.babysitter-state.md`:
     - Update the YAML front matter `gate:` field to `6`
     - Update the metadata table `Last Gate` cell to "6 — Code Review" and `Completed At` to today's ISO date
     - Fill in the `## Gate 6 — Code Review` section: replace `<!-- Pending -->` with:
       1. A `### Review Output` sub-heading containing the full structured review output verbatim (Critical Issues, High Priority, Medium Priority, Summary sections)
       2. A `### Resolution Status` sub-heading with the note: "All issues at all severity levels resolved."
     - Do not modify any other section.
   - Announce: "Gate 6 complete — advancing to Gate 7 (Ship)." Then immediately begin Gate 7.

## Exit Criteria

- [ ] Full checklist applied to all Gate 4 files
- [ ] Zero CRITICAL issues
- [ ] Zero HIGH issues
- [ ] Zero MEDIUM issues
- [ ] `docs/.babysitter-state.md` updated with gate: 6 and full review output embedded
- [ ] Auto-advanced to Gate 7

## What Must NOT Happen

- Do not summarize as "no issues found" without running the checklist item by item
- Do not advance with any finding at any severity level — fix everything
- Do not skip security checks for "non-security" changes — all content script code is security-sensitive
