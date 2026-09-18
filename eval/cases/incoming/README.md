# Drop captures here

Gitignored. Raw captures never enter git. What is committed is `eval/cases/golden.json`, which
`pnpm eval:derive` produces from these files: the parsed job, its questions and a hand-authored
expectation per case. The markup stays here; only the derived, scrubbed text is committed.

That inversion is the point. A posting expires, Eligible Jobs rotates, and your own Submit
deletes the form — but `golden.json` outlives all three, so a capture lost tomorrow still
grades a model next year.

## Per capture (~1 min)

1. Open the **apply** page: `talent.toptal.com/portal/job/…/confirm` — the "Job Interest
   Request" screen with the answer boxes. **Not** the job-detail page: only this one carries
   the `matcherQuestions` textareas, and a detail capture yields nothing gradeable.
2. Side panel → **Workflows** → Toptal → **Capture**.
3. Expand **Raw HTML**. **If the amber truncation banner shows, stop and say so** — that means
   the 500 KB `HTML_CAPTURE_LIMIT` is cutting the form off the bottom of the document, which is
   a production defect, not a fixture problem.
4. **Copy HTML** → save as `<slug>.html` in this folder.
5. Save `<slug>.meta.json` next to it:

```json
{ "url": "https://talent.toptal.com/portal/job/…/confirm", "title": "…" }
```

The clipboard carries the markup but not the URL or title, and `PageCapture` needs both.

Do **not** scrub or label anything — that is `pnpm eval:derive`'s job, and it is not
perishable. The derivation **merges**: it refreshes the mechanical fields and leaves every
hand-authored `archetype`, `expect` and `notes` exactly where it found them, keyed by case id.
Re-running it after adding a capture is safe.

**Capture before you press Submit.** Verified 2026-09-17: once an application is submitted,
Toptal redirects `/confirm` → `/application` and the form is gone for good — the page drops from
~350 KB to ~130 KB and `matcherQuestions` no longer exists. Two captures were lost this way. The
`/confirm` URL is also not reachable by address alone; it opens only from the job page's own
interest action, so a capture cannot be recovered later by anyone, including tooling.

Postings are perishable twice over, then: Eligible Jobs rotates, and your own Submit closes the
window on that one.

## What to aim for — 8 captured so far

Spread matters more than count. Each page yields ~9 gradeable cases.

- **2** jobs squarely inside your wheelhouse, so "cites correctly" is falsifiable
- **2** mostly outside it, so "denies honestly" is falsifiable
- **1** with `Client's Hours` absent, or a `Time Zone` that is not your browser's
- **1** with interview slots phrased unusually (a table, `Tue the 22nd 5:30–7:30 CEST`, Spanish)
- ideally one where every required skill is already claimed (no gaps signal at all)
- ideally one with a 2 000+ character description, so `JOB_CONTEXT_CHARS` truncation bites

Take what is live today. Coverage gaps get reported per archetype rather than hidden.

Suggested slugs: `ai-virtual-waiter`, `<company-or-domain>-<role>`. Lowercase, hyphenated.

## Known-damaged captures

`VjEtSm9iLTUwNDM0Mg` and `VjEtSm9iLTUwNzczNA` were reformatted by an editor before
`.prettierignore` covered this folder. Their question text carries newlines where spaces belong
(`"- Describe your experience with Python\n(Django, FastAPI) and React."`). Both jobs have since
been submitted, so neither can be re-captured.

Kept, and no longer a problem for anything graded: the derivation collapses runs of whitespace
in question text, so the committed question is the sentence either way. Their job records
`source.fidelity: "reformatted"` in `golden.json` so the limitation travels with the data — they
are **not** usable as parser-fidelity goldens if that scope is ever added.
