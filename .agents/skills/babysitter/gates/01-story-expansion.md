---
title: Gate 1 — Story Expansion
gate: 1
skill: /prd
---

# Gate 1: Story Expansion

## Purpose

Transform a vague feature request into a concrete, approved PRD. No implementation work begins until this document is approved.

## Procedure

1. Announce: "Starting Gate 1: Story Expansion. Invoking `/prd` skill."
2. Invoke the `/prd` skill. Follow its full three-phase workflow:
   - **Phase 1 (Discovery)**: Ask at minimum 2 clarifying questions — problem, success metrics, constraints.
   - **Phase 2 (Analysis)**: Map user flow, define non-goals.
   - **Phase 3 (Drafting)**: Produce the Strict PRD Schema document.
3. Output the complete PRD (all five sections: Executive Summary, UX & Functionality, AI Requirements if applicable, Technical Specs, Risks & Roadmap).
4. Save the PRD to `docs/<feature-name>-prd.md` where `<feature-name>` is a kebab-case slug derived from the PRD title (e.g. "Side-Panel Chat" → `side-panel-chat`). This file must exist on disk before asking for approval.
5. Present the PRD and ask:

   > "Gate 1 complete. Does this PRD capture the full scope of the feature?
   > Reply **APPROVE** to advance to Gate 2 (Plan), or provide feedback to revise."

6. If feedback is given: revise the PRD, overwrite `docs/<feature-name>-prd.md`, and re-present. Repeat until APPROVE.
7. On APPROVE:
   - Write `docs/.babysitter-state.md` with the following content (fill in real values):
     ```
     gate: 1
     feature: <feature-name>
     prd: docs/<feature-name>-prd.md
     plan: (not yet created)
     specs: (not yet created)
     changed-files: (not yet created)
     ```
   - Tell the user: "Gate 1 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 2 (Plan Approval)."

## Exit Criteria

- [ ] PRD contains all five schema sections
- [ ] Success criteria are measurable (no vague words like "fast" or "easy")
- [ ] Non-goals are explicitly listed
- [ ] PRD saved to `docs/<feature-name>-prd.md`
- [ ] `docs/.babysitter-state.md` written with gate: 1
- [ ] User has typed APPROVE
- [ ] User prompted to type `/clear`

## What Must NOT Happen

- No sprint plans
- No task lists
- No code files
- No test files
- No discussion of implementation approach beyond what the PRD requires for context
