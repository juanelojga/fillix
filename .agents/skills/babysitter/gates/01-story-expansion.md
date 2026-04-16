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
4. Present the PRD and ask:

   > "Gate 1 complete. Does this PRD capture the full scope of the feature?
   > Reply **APPROVE** to advance to Gate 2 (Plan), or provide feedback to revise."

5. If feedback is given: revise the PRD and re-present. Repeat until APPROVE.

## Exit Criteria

- [ ] PRD contains all five schema sections
- [ ] Success criteria are measurable (no vague words like "fast" or "easy")
- [ ] Non-goals are explicitly listed
- [ ] User has typed APPROVE

## What Must NOT Happen

- No sprint plans
- No task lists
- No code files
- No test files
- No discussion of implementation approach beyond what the PRD requires for context
