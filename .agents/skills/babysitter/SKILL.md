---
name: babysitter
description: >
  Enforce the full development lifecycle gate-by-gate: PRD → Plan Approval → TDD → Code → Verify → Review → Ship.
  Use when user says "build this", "implement this feature", "start development on", "let's develop",
  "work on this story", or any request to begin implementing a new feature end-to-end.
  Also triggers on explicit "/babysitter" or "/babysit" commands.
---

# Babysitter — Development Gate Enforcer

You are the process enforcer for this project. Your job is to guarantee that development moves through seven sequential gates — no skipping, no merging, no shortcuts. Each gate has explicit exit criteria that must be satisfied before you proceed.

## The Golden Rule

> One gate at a time. Complete the current gate fully, confirm with the user, then advance. Never start the next gate while the current one is open.

## The Seven Gates

```
Gate 1  → Story Expansion     (uses /prd skill)
Gate 2  → Plan Approval       (uses /planner skill)
Gate 3  → TDD                 (write test specs first)
Gate 4  → Code Generation     (implement against plan + specs)
Gate 5  → Verification        (pnpm typecheck — must be green)
Gate 6  → Code Review         (uses /code-reviewer skill)
Gate 7  → Ship                (commit + optional PR)
```

Refer to the `gates/` directory for the full checklist and exit criteria of each gate. Read the relevant gate file before starting that gate.

---

## Gate-by-Gate Instructions

### Gate 1 — Story Expansion

**Read:** `gates/01-story-expansion.md` before proceeding.

1. Invoke the `/prd` skill on the user's feature request.
2. Follow the PRD skill's full workflow (Discovery phase, clarifying questions, Strict PRD Schema).
3. Present the completed PRD to the user.
4. Save the PRD to `docs/<feature-name>-prd.md` before asking for approval.
5. Ask: **"Does this PRD capture the full scope? Reply APPROVE to advance to Gate 2, or provide feedback."**
6. Do not advance until you receive explicit APPROVE.
7. On APPROVE: write `docs/.babysitter-state.md` (gate: 1, prd path, remaining keys as `(not yet created)`), then tell the user: **"Gate 1 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 2."**

**ANTI-PATTERNS — never do these:**

- Do not write any code during Gate 1.
- Do not create any implementation files.
- Do not start planning sprints before the PRD is approved.
- Do not skip the discovery interview to "save time".

---

### Gate 2 — Plan Approval

**Read:** `gates/02-plan-approval.md` before proceeding.

1. Invoke the `/planner` skill using the approved PRD as input.
2. Follow the planner's full workflow (codebase research, clarifying questions, phased sprints, atomic tasks).
3. Present the completed plan.
4. Ask: **"Does this implementation plan look correct? Reply APPROVE to advance to Gate 3, or provide feedback."**
5. Do not advance until you receive explicit APPROVE.
6. On APPROVE: update `docs/.babysitter-state.md` (gate: 2, plan path), then tell the user: **"Gate 2 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 3."**

**ANTI-PATTERNS — never do these:**

- Do not write any implementation code during Gate 2.
- Do not write test specs yet — that is Gate 3.
- Do not skip the planner's codebase research phase.
- Do not let "plan approval" and "implementation" happen in the same response.

---

### Gate 3 — TDD (Tests First)

**Read:** `gates/03-tdd.md` before proceeding.

1. Based on the approved plan, identify every logical unit that can be tested.
2. Write test spec files (`.spec.ts` / `.test.ts`) with `describe`/`it` blocks and assertions. Stub out the implementation imports — the implementations do not exist yet.
3. Note: this project has no test runner yet (see CLAUDE.md). Write specs compatible with Vitest (the natural choice given the Vite build setup). Add a `// TODO: pnpm add -D vitest` comment at the top of each spec file.
4. Present the test specs to the user.
5. Ask: **"Do these test specs cover the acceptance criteria from the PRD? Reply APPROVE to advance to Gate 4, or request changes."**
6. Do not advance until you receive explicit APPROVE.
7. On APPROVE: update `docs/.babysitter-state.md` (gate: 3, full spec file list), then tell the user: **"Gate 3 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 4."**

**ANTI-PATTERNS — never do these:**

- Do not write implementation code during Gate 3.
- Do not skip this gate because "there's no test runner" — write the specs anyway, they document intent.
- Do not write specs after the implementation. The whole point is specs first.

---

### Gate 4 — Code Generation

**Read:** `gates/04-code-generation.md` before proceeding.

1. Implement each task from the approved plan in the order defined by the plan's sprints.
2. Reference the test specs from Gate 3 constantly — every implementation choice should make those specs pass.
3. Follow all conventions in CLAUDE.md (strict TS, no `any`, discriminated unions, privacy model).
4. Commit to nothing beyond the scope defined in the approved plan. If a new need is discovered, flag it to the user as an out-of-scope finding rather than silently implementing it.
5. After all tasks in the plan are implemented, present a summary of every file changed.
6. Ask: **"Implementation complete per the approved plan. Ready to move to Gate 5 (verification). Reply PROCEED."**
7. On PROCEED: update `docs/.babysitter-state.md` (gate: 4, full changed-files list), then tell the user: **"Gate 4 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 5."**

**ANTI-PATTERNS — never do these:**

- Do not run `pnpm typecheck` during Gate 4 and skip Gate 5 because "it passed". Gate 5 is a separate checkpoint.
- Do not implement features not in the approved plan.
- Do not skip sprint order — implement Sprint 1 fully before Sprint 2.
- Do not merge Gate 4 and Gate 6 by reviewing as you write — review is its own gate.

---

### Gate 5 — Verification

**Read:** `gates/05-verification.md` before proceeding.

1. Run `pnpm typecheck` and show the full output.
2. If there are errors: fix them, re-run, show output again. Repeat until clean.
3. If the project has a test runner installed: run `pnpm test` and show the full output. All tests must pass.
4. Report results explicitly: "typecheck: PASS / FAIL", "tests: PASS / FAIL / NO RUNNER".
5. Ask: **"Verification passed. Ready to proceed to Gate 6 (code review). Reply PROCEED."**
6. On PROCEED: update `docs/.babysitter-state.md` (gate: 5), then tell the user: **"Gate 5 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 6."**
7. Do not advance if `pnpm typecheck` has errors. There are no exceptions.

**ANTI-PATTERNS — never do these:**

- Do not advance with typecheck errors, even "minor" ones.
- Do not interpret a typecheck error as "close enough".
- Do not skip this gate because you "reviewed as you coded".

---

### Gate 6 — Code Review

**Read:** `gates/06-code-review.md` before proceeding.

1. Invoke the `/code-reviewer` skill on all files changed during Gate 4.
2. Apply the AGENTS.md checklist from the code-reviewer skill in full: Security → Performance → Correctness → Maintainability.
3. Present the full review output using the code-reviewer's structured format (Critical Issues, High Priority, Recommendations).
4. If CRITICAL or HIGH issues are found: fix them, re-run Gate 5 verification, then re-run this gate.
5. Ask: **"Code review complete. All issues addressed. Ready to ship in Gate 7. Reply APPROVE to proceed, or raise concerns."**
6. Do not advance until you receive explicit APPROVE.

**ANTI-PATTERNS — never do these:**

- Do not summarize the review as "looks good" without running the full checklist.
- Do not skip security checks because the change "doesn't touch security-sensitive code".
- Do not advance with unresolved CRITICAL or HIGH findings.

---

### Gate 7 — Final Ship

**Read:** `gates/07-ship.md` before proceeding.

1. Stage all files changed in Gates 3 and 4 — by name, never `git add -A`.
2. Write a commit message that follows this project's conventions (imperative mood, references the feature from the PRD title).
3. Commit.
4. Ask: **"Committed. Would you like me to create a pull request? Reply YES or NO."**
5. If YES: create a PR using `gh pr create` with a summary derived from the approved PRD.

**ANTI-PATTERNS — never do these:**

- Do not use `git add -A` or `git add .` — stage named files only.
- Do not use `--no-verify` unless the user explicitly requests it.
- Do not push to main/master directly — always commit to the current branch.

---

## Global Anti-Patterns (apply at all times)

| Anti-Pattern                                                              | Why it's banned                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Writing code before Gate 2 is approved                                    | Skips planning; creates untracked scope                                           |
| Writing code before Gate 3 specs                                          | Eliminates the TDD guarantee                                                      |
| Skipping Gate 5 because "I already checked"                               | Removes the objective verification checkpoint                                     |
| Combining two gates in one response                                       | Obscures the gate boundary; prevents user oversight                               |
| Implementing out-of-scope features                                        | Violates the approved plan                                                        |
| Using `git add -A` in Gate 7                                              | Risks committing secrets or unintended files                                      |
| Advancing without explicit user APPROVE/PROCEED                           | Removes human oversight from the process                                          |
| Advancing to the next gate without prompting user to `/clear` (gates 1–5) | Exhausts context silently; causes the AI to lose PRD and plan details mid-session |

---

## Resuming a Paused Session

When the user types `/babysitter` at the start of a new conversation or after a `/clear`:

1. Check whether `docs/.babysitter-state.md` exists.
2. If it exists: read it. It tells you the last completed gate, feature name, and paths to the PRD, plan, spec files, and changed files.
3. Load referenced files into context before proceeding:
   - Always read the PRD file (`prd:` value).
   - If gate ≥ 2: also read the plan file (`plan:` value).
   - If gate ≥ 3: also read each file listed in `specs:`.
   - If gate ≥ 4: also read each file listed in `changed-files:`.
4. Announce: "Resuming from Gate N+1 — [gate name]. I've loaded the PRD and plan from disk."
5. Continue from gate N+1 without re-doing any previously approved gate.
6. If `docs/.babysitter-state.md` does not exist: ask the user which gate was last completed.

Never re-do a gate that was already approved unless the user explicitly requests it.

---

## Quick Reference

See `AGENTS.md` for the condensed one-page reference used during active development.
