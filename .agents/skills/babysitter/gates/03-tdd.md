---
title: Gate 3 — TDD (Tests First)
gate: 3
---

# Gate 3: TDD — Write Test Specs Before Implementation

## Purpose

Encode the acceptance criteria as executable specifications before a single line of implementation is written. Even without a test runner installed, specs serve as design documents and runnable contracts once a runner is added.

## Context: No Test Runner Yet

Per `CLAUDE.md`: "There is no test runner yet." Write specs compatible with **Vitest** — the natural pairing for this project's Vite build setup. Place the following comment at the top of every spec file:

```typescript
// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
```

Do NOT install a test runner during this gate. If the user wants to install one, flag it as an optional action after Gate 3 approval.

## Procedure

1. Announce: "Starting Gate 3: TDD. Writing test specs before implementation."
2. For each unit of work in the approved plan, create a corresponding spec file:
   - Source files in `src/lib/` → specs at `src/lib/__tests__/<filename>.spec.ts`
   - Content script logic → `src/__tests__/content.spec.ts`
   - Background logic → `src/__tests__/background.spec.ts`
3. Each spec file must:
   - Import the function/module under test (import will fail until Gate 4 — that is expected)
   - Have a `describe` block named after the unit
   - Have `it` blocks named after each acceptance criterion
   - Contain assertions using `expect()` (Vitest-compatible)
   - NOT import or instantiate Chrome extension APIs directly — mock them with `vi.fn()` / `vi.mock()`
4. Present all spec files.
5. Edit `docs/.babysitter-state.md`:
   - Update the YAML front matter `gate:` field to `3`
   - Update the metadata table `Last Gate` cell to "3 — TDD" and `Completed At` to today's ISO date
   - Fill in the `## Gate 3 — TDD` section: replace `<!-- Pending -->` with:
     1. A `### Spec Files` sub-heading with a two-column table (`Path` | `Status`) — one row per spec file, status `written`
     2. A `### Spec Contents` sub-heading with one `#### \`<path>\``sub-sub-heading per file, each containing the full verbatim file content in a fenced`typescript` code block
   - Do not modify any other section.
6. Announce: "Gate 3 complete — advancing to Gate 4 (Code Generation)." Then immediately begin Gate 4.

## Exit Criteria

- [ ] One spec file per logical unit in the plan
- [ ] Every PRD acceptance criterion maps to at least one `it` block
- [ ] Chrome APIs are mocked, not called directly in tests
- [ ] Vitest TODO comment present in each file
- [ ] No implementation code exists yet
- [ ] `docs/.babysitter-state.md` updated with gate: 3, spec paths table, and full spec contents embedded
- [ ] Auto-advanced to Gate 4

## Spec File Template

```typescript
// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myFunction } from '../myModule'; // will resolve after Gate 4

describe('myFunction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should [acceptance criterion from PRD]', () => {
    // arrange
    // act
    // assert
    expect(true).toBe(true); // replace with real assertion
  });
});
```

## What Must NOT Happen

- No implementation code (`.ts` files under `src/` that are not `*.spec.ts`)
- No `pnpm add` commands
- No editing of existing source files
