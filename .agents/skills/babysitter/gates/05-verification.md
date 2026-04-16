---
title: Gate 5 — Verification
gate: 5
---

# Gate 5: Verification

## Purpose

Produce objective, tool-generated evidence that the codebase is structurally sound. Claude's opinion does not count here — only the tool output counts.

## Procedure

1. Announce: "Starting Gate 5: Verification."
2. Run `pnpm typecheck` and capture the full output.
3. Report result:
   - **PASS**: "typecheck: PASS — no errors."
   - **FAIL**: "typecheck: FAIL — [N] errors found. Fixing now."
4. If FAIL: fix every error, re-run, show the new output. Repeat until clean.
5. Check for test runner:
   - If `vitest` is in `package.json` devDependencies: run `pnpm exec vitest run` and show full output.
   - If not installed: report "tests: NO RUNNER — specs written in Gate 3 are pending runner installation."
6. Report final status:

   ```
   Gate 5 Verification Summary
   ---------------------------
   pnpm typecheck : PASS
   pnpm test      : PASS | NO RUNNER
   ```

7. If typecheck is PASS (test runner optional): ask:

   > "Gate 5 complete. Verification passed. Ready for Gate 6 (Code Review).
   > Reply **PROCEED**."

8. On PROCEED:
   - Update `docs/.babysitter-state.md` — overwrite the entire file with:
     ```
     gate: 5
     feature: <feature-name>
     prd: docs/<feature-name>-prd.md
     plan: docs/<feature-name>-plan.md
     specs: <same spec list from Gate 3>
     changed-files: <same list from Gate 4>
     ```
   - Tell the user: "Gate 5 complete. Type `/clear` to free up context, then come back and type `/babysitter` to continue from Gate 6 (Code Review)."

## Exit Criteria

- [ ] `pnpm typecheck` exits with zero errors
- [ ] If test runner exists: all tests pass
- [ ] Verification summary reported with actual tool output shown
- [ ] `docs/.babysitter-state.md` updated with gate: 5
- [ ] User has typed PROCEED
- [ ] User prompted to type `/clear`

## Typecheck Error Resolution Rules

- Fix the root type error — do not add `as unknown as T` casts to suppress it
- Do not add `// @ts-ignore` or `// @ts-expect-error` unless absolutely unavoidable and commented with justification
- If a fix requires a plan change (e.g. the approved task was architecturally flawed), flag it to the user before changing approach

## What Must NOT Happen

- Do not advance with any typecheck error, even if it appears "cosmetic"
- Do not report "PASS" based on a previous run — always run fresh
- Do not skip the test runner check if one exists
