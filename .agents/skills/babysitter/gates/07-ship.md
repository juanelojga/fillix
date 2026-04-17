---
title: Gate 7 — Final Ship
gate: 7
---

# Gate 7: Final Ship

## Purpose

Create a clean, traceable commit (and optionally a PR) representing the completed feature.

## Procedure

1. Announce: "Starting Gate 7: Final Ship."
2. Show the list of all files to be staged (derived from Gate 4's summary table).
3. Stage files by name — never use `git add -A` or `git add .`:
   ```bash
   git add src/lib/foo.ts src/lib/bar.ts src/__tests__/foo.spec.ts
   ```
4. Write a commit message following this format:
   - Imperative mood first line: "Add [feature name from PRD title]"
   - Blank line
   - Body: 1-3 bullet points summarizing what changed
   - Footer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. Commit using a heredoc to preserve formatting.
6. Ask:

   > "Committed. Would you like me to create a pull request? Reply **YES** or **NO**."

7. If YES: run `gh pr create` with:
   - Title derived from the PRD title (≤ 70 characters)
   - Body using the PRD's Executive Summary as the PR summary
   - Include test plan checklist derived from the PRD's acceptance criteria
8. After the commit (and after the PR step if applicable):
   - Edit `docs/.babysitter-state.md`:
     - Update the YAML front matter `gate:` field to `7`
     - Update the metadata table `Last Gate` cell to "7 — Ship" and `Completed At` to today's ISO date
     - Fill in the `## Gate 7 — Ship` section: replace `<!-- Pending -->` with:
       1. A `### Commit` sub-heading with a three-column table (`Hash` | `Message` | `Branch`) — one row using the output of `git rev-parse HEAD`, the first line of the commit message, and `git branch --show-current`
       2. A `### Pull Request` sub-heading with a two-column table (`URL` | `Title`) — one row with the PR URL from `gh pr create` output or "not created" if the user replied NO
     - Do not modify any other section.

## Commit Message Template

```
Add <feature name>

- <what changed in src/>
- <what specs were added>
- <any notable architectural decision>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## PR Body Template

```markdown
## Summary

- <bullet 1 from PRD Executive Summary>
- <bullet 2>
- <bullet 3>

## Test Plan

- [ ] <acceptance criterion 1 from PRD>
- [ ] <acceptance criterion 2>
- [ ] pnpm typecheck passes
- [ ] Code review completed (Gate 6)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Exit Criteria

- [ ] Only files from Gate 4's summary are staged (no extras)
- [ ] Commit message follows the format above
- [ ] `git status` shows clean working tree after commit
- [ ] PR created (if user said YES) and URL returned
- [ ] `docs/.babysitter-state.md` updated with gate: 7, commit hash, and PR URL

## What Must NOT Happen

- Do not use `git add -A` or `git add .`
- Do not use `--no-verify` unless explicitly requested by the user
- Do not push directly to `main` or `master` — commit to the current branch
- Do not force-push
- Do not skip the "Would you like a PR?" prompt — always ask
