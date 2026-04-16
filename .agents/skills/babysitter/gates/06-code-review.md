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

6. If CRITICAL or HIGH issues are found:
   - Fix all of them
   - Re-run `pnpm typecheck` (Gate 5 mini-run) to confirm fixes didn't break types
   - Re-run this gate's checklist on the changed files
7. When no CRITICAL or HIGH issues remain, ask:

   > "Gate 6 complete. Code review passed — all critical and high issues resolved.
   > Reply **APPROVE** to proceed to Gate 7 (Ship), or raise concerns."

## Exit Criteria

- [ ] Full checklist applied to all Gate 4 files
- [ ] Zero CRITICAL issues
- [ ] Zero HIGH issues
- [ ] Medium issues either fixed or explicitly accepted by user with a TODO comment
- [ ] User has typed APPROVE

## What Must NOT Happen

- Do not summarize as "no issues found" without running the checklist item by item
- Do not advance with any CRITICAL or HIGH finding
- Do not skip security checks for "non-security" changes — all content script code is security-sensitive
