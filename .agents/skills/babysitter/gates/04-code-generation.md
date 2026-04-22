---
title: Gate 4 — Code Generation
gate: 4
---

# Gate 4: Code Generation

## Purpose

Implement all tasks from the approved plan, in sprint order, so that the Gate 3 specs will pass.

## Procedure

1. Announce: "Starting Gate 4: Code Generation. Implementing per the approved plan."
2. Work through the plan sprint by sprint. Within each sprint, work task by task.
3. After each sprint (not each task): briefly report what was done and what's next. Do not wait for user approval between tasks unless a blocking question arises.
4. Reference the test specs from Gate 3 as the definition of "done" for each unit.
5. When all tasks in the plan are complete, present a summary table:

   | File           | Change type |
   | -------------- | ----------- |
   | src/lib/foo.ts | added       |
   | src/lib/bar.ts | modified    |

6. Edit `docs/.babysitter-state.md`:
   - Update the YAML front matter `gate:` field to `4`
   - Update the metadata table `Last Gate` cell to "4 — Code Generation" and `Completed At` to today's ISO date
   - Fill in the `## Gate 4 — Code Generation` section: replace `<!-- Pending -->` with a `### Changed Files` sub-heading and a three-column table (`File` | `Change Type` | `Summary`) — one row per file, where `Change Type` is `added`, `modified`, or `deleted`, and `Summary` is one sentence describing what was implemented in that file (reuse the summary table from step 5 and add the Summary column)
   - Do not modify any other section.
7. Announce: "Gate 4 complete — advancing to Gate 5 (Verification)." Then immediately begin Gate 5.

## CLAUDE.md Conventions (must be followed)

- Strict TypeScript everywhere — no `any`
- Discriminated unions for all message types; update both `Message` and `MessageResponse` in `types.ts`
- Every new `switch (msg.type)` must have a `default: { const _: never = msg }` exhaustiveness guard
- No new dependencies added without them appearing in the approved plan
- The content script runs on every page — keep it cheap; no side effects on load
- Ollama API calls route through `background.ts` only, never directly from content scripts
- New `host_permissions` entries must be justified against what the plan requires

## Out-of-Scope Findings

If during implementation you discover something that should be done but is NOT in the approved plan:

> "Out-of-scope finding: [describe the issue]. This is not in the approved plan. Should I add it or defer it?"

Do not implement it silently.

## Exit Criteria

- [ ] All tasks in the approved plan are implemented
- [ ] All files follow CLAUDE.md conventions (strict TS, no `any`, exhaustiveness guards)
- [ ] No files were modified outside the scope of the plan (except bug fixes flagged to user)
- [ ] Summary table of changed files presented
- [ ] `docs/.babysitter-state.md` updated with gate: 4 and changed-files table with per-file summaries
- [ ] Auto-advanced to Gate 5

## What Must NOT Happen

- Do not run `pnpm typecheck` and skip Gate 5
- Do not implement tasks from future sprints before completing the current sprint
- Do not implement features not in the plan
- Do not add dependencies not in the plan
