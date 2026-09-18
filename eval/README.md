# The eval harness

Grades **answer drafting**: a real job and the frozen profile in, drafted answers out, scored
against hand-authored expectations. Page parsing, retrieval and schedule arithmetic all run
because production runs them — they are exercised, not graded.

Everything here talks to a live Ollama and is therefore kept out of `pnpm test`. The two suites
share no glob, and CI runs neither: there is no Ollama on the runner.

## Running it

```bash
ollama serve                      # with the models in eval/profile/ollama.json pulled
pnpm eval                         # every *.eval.ts: hygiene, retrieval, drafting
pnpm eval:derive                  # rebuild golden.json from eval/cases/incoming/*.html
```

| Variable           | Effect                                                         |
| ------------------ | -------------------------------------------------------------- |
| `EVAL_MODEL`       | chat model, overriding `ollama.json` — the A/B knob            |
| `EVAL_EMBED_MODEL` | embedding model                                                |
| `EVAL_BASE_URL`    | Ollama base URL                                                |
| `EVAL_SAMPLES`     | repeats per case; output varies, and one sample is an anecdote |
| `EVAL_ONLY`        | substring filter on case id or archetype, for iterating        |

Comparing two models on one golden set is the point of having one:

```bash
pnpm eval                                   # baseline
EVAL_MODEL=gemma4:12b pnpm eval             # the comparison
# then diff the two JSON files in eval/reports/
```

Nothing passes `temperature` or `seed`. Pinning them would grade a system that never ships;
variance is handled with `EVAL_SAMPLES` and a pass **rate**.

## The files

| Path                | What it is                                                               |
| ------------------- | ------------------------------------------------------------------------ |
| `cases/golden.json` | **the golden set** — jobs, questions, expectations. Committed.           |
| `cases/incoming/`   | raw captures. Gitignored, perishable, the input to `eval:derive`.        |
| `profile/`          | the frozen world: CV, availability, model names.                         |
| `golden.eval.ts`    | hygiene on the golden set. No Ollama, ~1 s. The fast loop.               |
| `retrieval.eval.ts` | ranking on its own, before any drafting.                                 |
| `drafting.eval.ts`  | the live run and the scorecard.                                          |
| `survey.eval.ts`    | prints what the raw captures parse to. The parser's early warning.       |
| `derive/`           | the derivation. Deliberately not under `cases/`, which prettier ignores. |

## The golden set

One file, two arrays cross-referenced by `jobId` so each description is written once.

- **10 jobs** — 8 derived from real Toptal `/confirm` captures, 2 hand-written.
- **73 cases** — 45 real questions and pitches, 28 hand-written adversarial ones.
- **30 archetypes**, every one of them populated; `golden.eval.ts` fails if any goes empty.

No client is ever pseudonymized because Toptal never names one: the Company Information block
carries a country, a founding year, a team size and an industry, and every description says "our
client". What _is_ scrubbed is the applicant's identity, through the gitignored
`scrub/identities.local.json`. Technologies and vendors are kept verbatim — they are precisely
what grounding is graded on.

### Re-deriving is safe

`pnpm eval:derive` **merges**. `archetype`, `expect` and `notes` are carried across by case id;
only the mechanical fields refresh. Cases whose capture is gone are kept, which is the point —
`golden.json` outlives the HTML, so a posting deleted tomorrow still grades a model next year.

### Authoring an expectation

```jsonc
"expect": {
  "grounded": true,            // false expects the grounding guard to fire
  "noExperience": false,       // null = the archetype does not decide it
  "mustCiteAny": [["A", "B"]], // groups: every group needs one hit
  "mustNotCite": [],
  "mustNotClaim": ["Supabase"],// judged, never substring-matched — see below
  "mustMentionAny": [["RLS"]],
  "mustNotMention": [],        // exact substrings, deterministic, rare
  "scheduleUsed": null,
  "maxChars": 900,
  "allowEmpty": false
}
```

**`mustNotClaim` is not auto-seeded from `missingRequiredSkills`, and that is deliberate.**
Toptal's `onProfile` flag describes its own profile's skill list, which disagrees with the CV —
it marks FastAPI and A/B Testing as missing while the CV has a section for each.
`golden.eval.ts` prints every disagreement on each run. Seeding from it would fail correct
answers.

It is also why `mustNotClaim` and `mustNotMention` are separate. One real capture asks _"is
there any required skill you are missing?"_, where **naming** the skill is the right answer — a
substring check cannot tell "I have used Supabase" from "I have not used Supabase", so that
judgement never runs deterministically.

## What the scores mean

Lane A is deterministic and carries the score. Each check is `pass`, `fail`, or `null` when the
case does not decide it — nulls are reported and never counted.

| Check                           | What it asserts                                                       |
| ------------------------------- | --------------------------------------------------------------------- |
| `grounding-guard`               | a draft came back at all (or the guard fired, where that is expected) |
| `cites-retrieved`               | every citation is traceable to a section the model was shown          |
| `citation-format`               | citations are headings, not quoted body text                          |
| `cites-expected`                | the right sections were used                                          |
| `denial-shape`                  | an expected denial is bare: `statesNoExperience` **and** no citations |
| `numbers-in-evidence`           | every year and tenure in the answer appears in the evidence           |
| `no-forbidden` / `must-mention` | exact substrings absent / synonym groups covered                      |
| `schedule-reached-the-model`    | a computed schedule actually reached the prompt                       |
| `style`                         | length bounds, no markdown, the voice the kind is written in          |

`cites-retrieved` is the one production **structurally cannot** run: `normalizeAnswerDraft` only
tests that `drew_on` is non-empty, so an answer citing a section it was never shown passes in the
extension today. Here the retrieved chunks are in hand.

`citation-format` is split off from it on purpose. A model that quotes the paragraph it used has
not hallucinated — it has formatted a true citation badly, which is a prompt fix. A model that
names a section it was never shown has invented evidence, which is the failure this whole design
exists to stop. One number would hide the second behind the first.

### Reading a low score: suspect the grader first

The first full run reported `cites-retrieved` at 32%, which would have read as the model
fabricating citations on two answers in three. All three causes were in the grader:

- `profile.md` is **hard-wrapped**, so a chunk holds `"…Asterisk ARI and\nWebSockets"` while the
  model quotes it re-flowed with a space. Whitespace is now flattened on both sides.
- the **availability block** was not searched, so a schedule answer quoting its own computed
  overlap was scored as inventing it — the precise inversion of the check's purpose.
- a 20-character floor on quotes was rejecting real evidence like `"Aug 2026 – present"`.

The same run also showed `schedule-reached-the-model` failing on four cases where the _question_
named no clock time, so there was nothing to convert and the code was right to produce nothing.
Those expectations were wrong, not the pipeline.

This is the failure `golden.eval.ts` exists to make rare and cannot eliminate: a bad harness
reports in exactly the same shape as a bad model. Before believing a number, read the `detail`
on a handful of failing checks in `eval/reports/*.json` and confirm the failure is the one the
check is named after.

### The suite does not fail on a bad score

`drafting.eval.ts` asserts that the harness _ran_, not that the model was good. A score is a
measurement to read; failing on it would make every prompt experiment look like a broken build.

### Known-bad replay

A case with `knownOutput` carries what was already in the page's textarea — for several
captures, Fillix's own earlier output. It is replayed through the grader on every run. A grader
that passes everything is not a grader.

## Baseline — two models, 73 cases

Both runs graded `golden 782cc17d · profile 898a0d62`, which is the only condition under which
two reports mean anything side by side.

| Check                        | `qwen3.5:9b`      | `gemma4:12b`      |
| ---------------------------- | ----------------- | ----------------- |
| `cites-retrieved`            | 73%               | **100%**          |
| `citation-format`            | 33%               | **100%**          |
| `cites-expected`             | 65%               | 73%               |
| `denial-shape`               | 77%               | 92%               |
| `must-mention`               | 80%               | 88%               |
| `grounding-guard`            | 97%               | 99%               |
| `style`                      | 97%               | 96%               |
| `numbers-in-evidence`        | 100%              | 100%              |
| `schedule-reached-the-model` | 100%              | 100%              |
| **total**                    | **275/358 (77%)** | **329/352 (94%)** |

**`gemma4:12b` is materially better at grounding**, and the gap is concentrated exactly where it
matters: it returns clean `##` headings, never cited a section it was not shown, and never
invented a date. That is a model choice worth acting on, and no amount of reading individual
answers would have established it.

### Single-sample scores have real variance

`qwen3.5:9b` scored 285/356 and then 275/358 under identical configuration, because nothing
pins `temperature` — deliberately, since pinning it would grade a system that never ships. So a
~3% swing is noise. The 17-point gap above is not, but any _smaller_ difference should be run
with `EVAL_SAMPLES=3` or more before it is believed.

### Findings this produced, none of them visible to `pnpm test`

1. **`drew_on` is filled with source lines, not headings** (qwen). One answer returned
   twenty-two entries, each a single hard-wrapped line of `profile.md`
   (`"React and TypeScript are my strongest frontend stack, used across Intuit,"`).
   `AnswerCard.svelte` renders those as the user-facing _Drew on_ chips, so the evidence trail a
   reviewer checks the answer against is unreadable. `gemma4:12b` does not do this, which points
   at the prompt rather than at the design.
2. **The job posting gets cited as profile evidence.** One answer listed
   `"develop backend services and integrate third-party travel APIs/platforms."` — the client's
   own words — under `drew_on`. `resolveCitations` searches only the retrieved chunks and the
   availability block, never `assembled.job`, so this stays a failure rather than being
   forgiven.
3. **A question with no possible profile evidence produces a hard error, not an empty draft.**
   "Do you prefer to be contacted on Slack or by email?" trips the grounding guard and the user
   sees a drafting failure. Whether logistics questions should be exempt is a product decision;
   the case expects success so it turns green by itself once that is made.
4. **`applicantName()` returns `"Alex Rivera — Profile"`**, because the profile's H1 is
   `# Alex Rivera — Profile` and the function strips only the `#`. Every third-person pitch
   therefore opens _"Alex Rivera — Profile is a Senior Software Engineer…"_ — in the box Toptal
   forwards to a client. Not fixed here: it is `src/` behaviour and the right fix is a judgement
   call between changing the H1, stripping a trailing `— <word>`, and rejecting a candidate
   containing "Profile"/"CV".

Two cases are deliberately **known red** and say so in their `notes`. A golden set with no red
rows is either measuring nothing or has been quietly bent to fit.

## Lane B is not implemented, and that is a decision

The rubric checks that need a second model — "does this answer assert hands-on experience with
X?" and "does it answer the question asked?" — are **not** wired up. `mustNotClaim` is carried
into the JSON report so a judge can be added later without re-running anything.

A local judge grading a local drafter is correlated noise. Before it is built, hand-label ~15
cases and measure agreement; if it is poor, score on Lane A alone rather than publish a number
nobody trusts. Lane B must never gate.
