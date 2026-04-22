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
5. Present the PRD.
6. Write `docs/.babysitter-state.md`. The file must contain, in order:
   1. A YAML front matter block with `gate: 1` and `feature: <feature-name>`
   2. A top-level heading `# Babysitter Session: <Feature Name>`
   3. A metadata table with three rows: Feature, Last Gate ("1 — Story Expansion"), Completed At (today's ISO date)
   4. A `## Gate 1 — Story Expansion` section containing a `### PRD` sub-heading followed by the full verbatim PRD content in a fenced `markdown` code block
   5. Stub sections for Gates 2 through 7 — each with its `## Gate N — Name` heading and a single `<!-- Pending -->` comment, nothing else
7. Announce: "Gate 1 complete — advancing to Gate 2 (Plan Approval)." Then immediately begin Gate 2.

## Exit Criteria

- [ ] PRD contains all five schema sections
- [ ] Success criteria are measurable (no vague words like "fast" or "easy")
- [ ] Non-goals are explicitly listed
- [ ] PRD saved to `docs/<feature-name>-prd.md`
- [ ] `docs/.babysitter-state.md` written with gate: 1 and full PRD content embedded
- [ ] Auto-advanced to Gate 2

## What Must NOT Happen

- No sprint plans
- No task lists
- No code files
- No test files
- No discussion of implementation approach beyond what the PRD requires for context
