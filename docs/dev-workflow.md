# Development Workflow — Gate Enforcer

This document explains the enforced development process used in this project. Every new feature or significant change goes through seven sequential gates before shipping.

## Why Gates?

Without enforced gates, AI agents skip steps: they jump from feature request to code, skip tests, and call it done. The gate system ensures:

- Features are fully scoped before a line of code is written
- Plans are approved by a human before implementation begins
- Tests document intent before implementation exists
- Code compiles and types check before review
- Security and correctness are reviewed before shipping
- Every ship is a traceable commit with a clear message

## The Seven Gates

```
Gate 1  Story Expansion   →  /prd skill         →  APPROVE
Gate 2  Plan Approval     →  /planner skill      →  APPROVE
Gate 3  TDD               →  write .spec.ts      →  APPROVE
Gate 4  Code Generation   →  implement plan      →  PROCEED
Gate 5  Verification      →  pnpm typecheck      →  PROCEED
Gate 6  Code Review       →  /code-reviewer      →  APPROVE
Gate 7  Ship              →  git commit + PR?    →  YES/NO
```

---

### Gate 1 — Story Expansion

**What happens:** The `/prd` skill expands the raw feature request into a full Product Requirements Document with an executive summary, user stories, acceptance criteria, technical specifications, and risks.

**You do:** Read the PRD, check that it captures your intent. Type `APPROVE` when satisfied.

**Output:** A PRD document.

---

### Gate 2 — Plan Approval

**What happens:** The `/planner` skill researches the codebase and creates a phased implementation plan with atomic, committable tasks, sprint ordering, and validation steps.

**You do:** Read the plan, check that it covers all PRD requirements with appropriate detail. Type `APPROVE` when satisfied.

**Output:** A plan saved to `docs/<feature>-plan.md`.

---

### Gate 3 — TDD (Tests First)

**What happens:** Claude writes test specification files (`.spec.ts`) using Vitest syntax, covering every acceptance criterion from the PRD. No implementation code is written yet.

**Note:** This project has no test runner installed yet. Specs are written now and become runnable once Vitest is added (`pnpm add -D vitest`).

**You do:** Review the specs to confirm they cover the intended behavior. Type `APPROVE` when satisfied.

**Output:** `.spec.ts` files in `src/__tests__/` or `src/lib/__tests__/`.

---

### Gate 4 — Code Generation

**What happens:** Claude implements every task in the approved plan, sprint by sprint, following all CLAUDE.md conventions (strict TypeScript, discriminated unions, no content-script side effects on load, etc.). If Claude discovers something out of scope, it flags it for your decision rather than implementing it silently.

**You do:** Monitor progress. Decide on any flagged out-of-scope findings. Type `PROCEED` when all tasks are done.

**Output:** All implementation files changed per the plan.

---

### Gate 5 — Verification

**What happens:** Claude runs `pnpm typecheck`. If a test runner is installed, it also runs the test suite. Any failure is fixed before advancing.

**You do:** Review the verification output. Type `PROCEED` when green.

**Output:** Clean `pnpm typecheck` output (zero errors).

---

### Gate 6 — Code Review

**What happens:** The `/code-reviewer` skill applies the project's full checklist (security, performance, correctness, maintainability) to all new code. Critical and high issues are fixed before advancing.

**You do:** Read the review summary. Type `APPROVE` when satisfied that issues are resolved.

**Output:** A structured review report.

---

### Gate 7 — Final Ship

**What happens:** Claude stages the changed files by name, writes a commit message, commits, and offers to create a pull request.

**You do:** Confirm the commit looks right. Type `YES` or `NO` when asked about creating a PR.

**Output:** A commit on your current branch; optionally a GitHub PR.

---

## Starting the Workflow

To begin a new feature with full gate enforcement:

```
/babysitter
```

Then describe the feature you want to build. Claude will start at Gate 1 automatically.

## Resuming an Interrupted Session

If work was interrupted, tell Claude which gate was last completed:

> "Resume the babysitter workflow. We completed Gate 2."

Claude will pick up from Gate 3.

## Intentionally Skipping a Gate

Gates cannot be skipped programmatically. If you want to skip a gate, tell Claude explicitly. Claude will warn you of the implications (e.g., skipping Gate 3 means no specs exist as a contract; skipping Gate 5 means unverified code enters review). The decision is yours — Claude will proceed if you confirm.

## APPROVE vs PROCEED

Two distinct response tokens are used to signal gate transitions:

- **APPROVE** — you have reviewed an artifact (PRD, plan, specs, review) and signed off on its content.
- **PROCEED** — you are acknowledging a self-validating result (e.g., typecheck passed) and granting permission to continue.

The distinction prevents casual sign-off on deliverables that deserve careful review.

## Related Skills

| Skill            | Invoked at               |
| ---------------- | ------------------------ |
| `/prd`           | Gate 1 — Story Expansion |
| `/planner`       | Gate 2 — Plan Approval   |
| `/code-reviewer` | Gate 6 — Code Review     |
