---
title: Gate 2 — Plan Approval
gate: 2
skill: /planner
---

# Gate 2: Plan Approval

## Purpose

Convert the approved PRD into a concrete, sprint-based implementation plan with atomic tasks. No code is written until this plan is approved.

## Procedure

1. Announce: "Starting Gate 2: Plan Approval. Invoking `/planner` skill."
2. Invoke the `/planner` skill with the approved PRD as input. Follow its full workflow:
   - **Phase 0 (Research)**: Explore the codebase — architecture, patterns, similar implementations.
   - **Phase 1 (Clarify)**: Ask up to 10 questions to resolve scope ambiguities.
   - **Phase 2 (Create Plan)**: Produce phased sprints with atomic, committable tasks.
   - **Phase 3 (Save)**: Save the plan as `docs/<feature-name>-plan.md`.
   - **Phase 4 (Gotchas)**: Identify pitfalls and refine.
3. Each task in the plan must include: location (file paths), description, dependencies, acceptance criteria, validation method.
4. Present the plan and ask:

   > "Gate 2 complete. Does this implementation plan cover all PRD requirements with sufficient detail?
   > Reply **APPROVE** to advance to Gate 3 (TDD), or provide feedback to revise."

5. If feedback is given: revise and re-present. Repeat until APPROVE.
6. On APPROVE:
   - Update `docs/.babysitter-state.md` — overwrite the entire file with:
     ```
     gate: 2
     feature: <feature-name>
     prd: docs/<feature-name>-prd.md
     plan: docs/<feature-name>-plan.md
     specs: (not yet created)
     changed-files: (not yet created)
     ```
   - Tell the user: "Gate 2 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 3 (TDD — Test Specs)."

## Exit Criteria

- [ ] Plan saved to `docs/<feature-name>-plan.md`
- [ ] Every PRD acceptance criterion is addressed by at least one task
- [ ] Every task has file paths, acceptance criteria, and validation method
- [ ] Sprints are ordered so each produces a demoable/testable increment
- [ ] `docs/.babysitter-state.md` updated with gate: 2 and plan path
- [ ] User has typed APPROVE
- [ ] User prompted to type `/clear`

## What Must NOT Happen

- No `.ts` implementation files created
- No `.spec.ts` test files created
- No `pnpm install` of new packages (list them in the plan as prerequisites; install during Gate 4)
