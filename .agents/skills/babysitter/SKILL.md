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

> One gate at a time. Complete the current gate fully, then advance automatically. Gates 1–6 auto-advance. Only Gate 7 requires explicit user approval before acting.

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
4. Save the PRD to `docs/<feature-name>-prd.md`.
5. Write `docs/.babysitter-state.md` — YAML front matter (`gate: 1`, `feature: <name>`), metadata table, the full PRD content embedded in a `## Gate 1` section, and stub `<!-- Pending -->` sections for Gates 2–7.
6. Announce: **"Gate 1 complete — advancing to Gate 2 (Plan Approval)."** Then immediately begin Gate 2.

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
4. Edit `docs/.babysitter-state.md` — update front matter `gate:` to `2`, update metadata table, and fill in the `## Gate 2` section with the full plan content embedded. Do not overwrite other sections.
5. Announce: **"Gate 2 complete — advancing to Gate 3 (TDD)."** Then immediately begin Gate 3.

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
5. Edit `docs/.babysitter-state.md` — update front matter `gate:` to `3`, update metadata table, and fill in the `## Gate 3` section with a spec-files table and the full verbatim content of each spec file. Do not overwrite other sections.
6. Announce: **"Gate 3 complete — advancing to Gate 4 (Code Generation)."** Then immediately begin Gate 4.

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
6. Edit `docs/.babysitter-state.md` — update front matter `gate:` to `4`, update metadata table, and fill in the `## Gate 4` section with a changed-files table (File, Change Type, one-sentence Summary per file). Do not overwrite other sections.
7. Announce: **"Gate 4 complete — advancing to Gate 5 (Verification)."** Then immediately begin Gate 5.

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
5. Edit `docs/.babysitter-state.md` — update front matter `gate:` to `5`, update metadata table, and fill in the `## Gate 5` section with the exact `pnpm typecheck` stdout and a result table. Do not overwrite other sections.
6. Announce: **"Gate 5 complete — advancing to Gate 6 (Code Review)."** Then immediately begin Gate 6.
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
4. Fix every issue found at any severity level (CRITICAL, HIGH, MEDIUM) — no deferral, no skipping. Re-run typecheck after fixes, then re-run the checklist. Repeat until fully clean.
5. Edit `docs/.babysitter-state.md` — update front matter `gate:` to `6`, update metadata table, and fill in the `## Gate 6` section with the full structured review output and a resolution note. Do not overwrite other sections.
6. Announce: **"Gate 6 complete — advancing to Gate 7 (Ship)."** Then immediately begin Gate 7.

**ANTI-PATTERNS — never do these:**

- Do not summarize the review as "looks good" without running the full checklist.
- Do not skip security checks because the change "doesn't touch security-sensitive code".
- Do not advance with any unresolved finding at any severity level.

---

### Gate 7 — Final Ship

**Read:** `gates/07-ship.md` before proceeding.

**This is the only gate that requires explicit user approval.**

1. Present a pre-flight summary:
   - Files to be staged (from Gate 4's summary table)
   - Draft commit message
   - Current branch name
2. Ask: **"Ready to ship? Reply APPROVE to commit, or NO to abort."**
3. Do not commit until you receive explicit APPROVE.
4. On APPROVE: stage all files from Gates 3 and 4 by name — never `git add -A`. Then commit.
5. Ask: **"Committed. Would you like me to create a pull request? Reply YES or NO."**
6. If YES: create a PR using `gh pr create` with a summary derived from the approved PRD.
7. After commit (and PR step if applicable): edit `docs/.babysitter-state.md` — update front matter `gate:` to `7`, update metadata table, and fill in the `## Gate 7` section with a commit table (hash, message, branch) and a PR table (URL or "not created", title). Do not overwrite other sections.

**ANTI-PATTERNS — never do these:**

- Do not use `git add -A` or `git add .` — stage named files only.
- Do not use `--no-verify` unless the user explicitly requests it.
- Do not push to main/master directly — always commit to the current branch.

---

## Global Anti-Patterns (apply at all times)

| Anti-Pattern                                | Why it's banned                                                    |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Writing code before Gate 2 plan exists      | Skips planning; creates untracked scope                            |
| Writing code before Gate 3 specs            | Eliminates the TDD guarantee                                       |
| Skipping Gate 5 because "I already checked" | Removes the objective verification checkpoint                      |
| Skipping a gate entirely                    | Breaks the sequential guarantee; each gate's output feeds the next |
| Implementing out-of-scope features          | Violates the approved plan                                         |
| Using `git add -A` in Gate 7                | Risks committing secrets or unintended files                       |
| Committing before Gate 7 APPROVE            | Bypasses the single user-controlled checkpoint                     |

---

## Resuming a Paused Session

When the user types `/babysitter` after an interruption:

1. Check whether `docs/.babysitter-state.md` exists.
2. If it exists: read it. Parse the YAML front matter for `gate:` (last completed gate) and `feature:`. All context you need is embedded in the gate sections of this single file:
   - `## Gate 1` contains the full approved PRD
   - `## Gate 2` contains the full implementation plan
   - `## Gate 3` contains all spec file paths and their full contents
   - `## Gate 4` contains the changed-files table with per-file summaries
   - `## Gate 5` contains the exact typecheck output and result table
   - `## Gate 6` contains the full code review output
   - `## Gate 7` contains the commit hash and PR URL
3. Do not hunt down separate `docs/<feature>-prd.md` or `docs/<feature>-plan.md` files for context — the session document is the authoritative source.
4. Announce: **"Resuming from Gate N+1 — [gate name]. Session context loaded from `docs/.babysitter-state.md`."**
5. Continue from gate N+1, auto-advancing as normal. Only Gate 7 requires explicit APPROVE before committing.
6. If `docs/.babysitter-state.md` does not exist: ask the user which gate was last completed.

Never re-do a gate that was already completed unless the user explicitly requests it.

---

## Quick Reference

See `AGENTS.md` for the condensed one-page reference used during active development.
