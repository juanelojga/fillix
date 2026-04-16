# Babysitter Skill — Agent Quick Reference

## Gate Map

| #   | Gate            | Skill Invoked          | User Action Required    |
| --- | --------------- | ---------------------- | ----------------------- |
| 1   | Story Expansion | `/prd`                 | APPROVE PRD             |
| 2   | Plan Approval   | `/planner`             | APPROVE Plan            |
| 3   | TDD             | (write specs)          | APPROVE Specs           |
| 4   | Code Generation | (implement)            | PROCEED                 |
| 5   | Verification    | `pnpm typecheck`       | PROCEED (auto if green) |
| 6   | Code Review     | `/code-reviewer`       | APPROVE Review          |
| 7   | Ship            | `git commit` + `gh pr` | YES/NO for PR           |

**After gates 1–6:** append gate content to `docs/.babysitter-state.md` (each gate fills its own section) and prompt user to type `/clear` before the next gate.

## Gate Exit Criteria (summary)

- **Gate 1**: PRD written with full PRD schema, saved to `docs/<feature>-prd.md`, state file created with full PRD content embedded, user typed APPROVE, user prompted to `/clear`.
- **Gate 2**: Phased plan with atomic tasks exists, saved to `docs/`, state file Gate 2 section filled with full plan content, user typed APPROVE, user prompted to `/clear`.
- **Gate 3**: `.spec.ts` files exist with describe/it blocks, state file Gate 3 section filled with spec paths table and full spec contents, user typed APPROVE, user prompted to `/clear`.
- **Gate 4**: All plan tasks implemented, state file Gate 4 section filled with changed-files table (File, Change Type, Summary), user typed PROCEED, user prompted to `/clear`.
- **Gate 5**: `pnpm typecheck` exits with zero errors, state file Gate 5 section filled with exact typecheck output and result table, user typed PROCEED, user prompted to `/clear`.
- **Gate 6**: Full code-reviewer checklist run, CRITICAL/HIGH issues resolved, state file Gate 6 section filled with full review output, user typed APPROVE, user prompted to `/clear`.
- **Gate 7**: Commit created with named files only, state file Gate 7 section filled with commit hash and PR URL; PR created if user said YES.

## Hard Rules

1. Never advance a gate without the required user response.
2. Never write implementation code before Gate 2 APPROVE.
3. Never write implementation code before Gate 3 specs exist.
4. Never advance past Gate 5 with typecheck errors.
5. Never commit with `git add -A` or `git add .`.
6. Never implement anything outside the approved plan — flag it instead.
7. After each gate 1–6 APPROVE/PROCEED: fill that gate's section in `docs/.babysitter-state.md`, then prompt the user to type `/clear`.

## Gate File Index

- `gates/01-story-expansion.md` — PRD workflow detail
- `gates/02-plan-approval.md` — Planner workflow detail
- `gates/03-tdd.md` — Spec writing detail + Vitest guidance
- `gates/04-code-generation.md` — Implementation rules + CLAUDE.md conventions
- `gates/05-verification.md` — Typecheck + test runner detail
- `gates/06-code-review.md` — Code reviewer checklist
- `gates/07-ship.md` — Git + PR detail

## Anti-Pattern Fast Lookup

| If you're about to...                     | Stop. Check this first.               |
| ----------------------------------------- | ------------------------------------- |
| Write any `.ts` implementation file       | Gates 2 and 3 must be APPROVED        |
| Run `git add -A`                          | Gate 7 — use named files only         |
| Skip typecheck                            | You cannot — Gate 5 is mandatory      |
| Write specs and impl in the same response | Split them — Gate 3 then Gate 4       |
| Add a feature not in the plan             | Flag it to the user, do not implement |
| Move to code review without typecheck     | Run Gate 5 first                      |
