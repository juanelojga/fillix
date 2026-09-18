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
| `grader.eval.ts`    | the grader, graded. No Ollama. Part of the fast loop.                    |
| `retrieval.eval.ts` | ranking on its own, before any drafting.                                 |
| `drafting.eval.ts`  | the live run and the scorecard.                                          |
| `survey.eval.ts`    | prints what the raw captures parse to. The parser's early warning.       |
| `derive/`           | the derivation. Deliberately not under `cases/`, which prettier ignores. |

## The golden set

One file, two arrays cross-referenced by `jobId` so each description is written once.

- **12 jobs** — 8 derived from real Toptal `/confirm` captures, 4 hand-written.
- **77 cases** — 45 real questions and pitches, 32 hand-written adversarial ones.
- **34 archetypes**, every one of them populated; `golden.eval.ts` fails if any goes empty.
- **13 of those cases are pitches** — one per capture plus five hand-written. `EVAL_ONLY=pitch`
  selects the lot, which is why every pitch archetype keeps the `pitch-` prefix.

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
| `no-forbidden-citation`         | no heading in `mustNotCite` was leant on                              |
| `schedule-reached-the-model`    | a computed schedule actually reached the prompt                       |
| `pitch-voice`                   | third person, no `I`/`my`/`me`, and the subject is named              |
| `pitch-not-a-denial`            | no denial written where an empty pitch belongs                        |
| `pitch-substance`               | grounded in the CV, not only in the injected hours                    |
| `style`                         | length bounds and no markdown                                         |

`cites-retrieved` is the one production **structurally cannot** run: `normalizeAnswerDraft` only
tests that `drew_on` is non-empty, so an answer citing a section it was never shown passes in the
extension today. Here the retrieved chunks are in hand.

`citation-format` is split off from it on purpose. A model that quotes the paragraph it used has
not hallucinated — it has formatted a true citation badly, which is a prompt fix. A model that
names a section it was never shown has invented evidence, which is the failure this whole design
exists to stop. One number would hide the second behind the first.

### The pitch lane

`EVAL_ONLY=pitch pnpm eval` runs the 13 pitch cases and nothing else.

The pitch has three properties a question does not, and until they were checked here **nothing
anywhere graded them** — `src/`'s unit specs assert that the instructions were _sent_, never
that the output obeyed them:

- **Voice.** `pitchSystemPrompt` states it three times, last and loudest, and its own docblock
  records that sharing the rule with the question prompt "is what made the pitch inherit the
  wrong voice". That regression has already happened once. `pitch-voice` also requires the
  subject to be named, since the prompt injects it precisely so the pitch does not have to
  retrieve it.
- **A denial where an empty answer belongs.** `denial-shape` cannot see this one: the `NEGATION`
  in `states-no-experience.ts` is first person only, so "Rivera has no experience with Supabase"
  reads to it as an ordinary answer. `pitch-not-a-denial` is structural for the same reason that
  module is — the prompt permits "name a gap once and move on", so only a short lead-with-negation
  counts, never a negation anywhere in the text.
- **Substance.** `assembleAnswerEvidence` appends the availability block to a pitch too, so a
  pitch citing only `## Meeting availability` satisfies the grounding guard while saying nothing
  about the applicant's experience.

The three are `null` for a question and for an empty draft, so question cases keep the `scored`
count they had before and `''` — the answer an unsupportable pitch is asked for — is never
punished.

Authoring a pitch case, all enforced by `golden.eval.ts`:

- `question` is exactly `PITCH_QUESTION`. It is the drafts-map key and has already had to
  survive Toptal relabelling the box.
- `noExperience` is never `true`. The prompt asks for an empty `text`, not a denial.
- `minChars` is the page's floor (180) and must not exceed `maxChars`, or `style` can never pass.
- `archetype` starts with `pitch`, so `EVAL_ONLY=pitch` keeps selecting the whole lane.

`retrieval.eval.ts` carries a second labelled set for `buildPitchQuery`, which searches on the
job rather than on a question. It is what separates "the pitch was written badly" from "the pitch
was handed the wrong sections" — the same reason that file exists at all.

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

`grader.eval.ts` is the other half of that argument, and it exists because replay cannot cover
the pitch: no capture contains a first-person pitch, a third-person denial or a pitch grounded
only on the hours, so those checks would report a clean sheet whether they worked or not. It
feeds each one the draft it exists to catch, plus a good pitch that must pass, plus a question
that must score none of them.

## Baseline — two models, 73 cases (pre-pitch)

> **Stale by construction.** Both runs graded `golden 782cc17d`, and
> `goldenFingerprintInput` hashes every `expect` — so adding the four pitch cases moved the
> hash and a new report is **not** comparable to the table below. The per-check rates still read
> as a fair picture of the two models on the question lane; the totals do not. Re-run both
> models to replace them, and note that the pitch checks are new denominators rather than a
> regression when the totals move.

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

### The pitch lane's first numbers

One run of `qwen3.5:9b` over `golden abdae191`, 13 pitch cases, single sample:

| Check                   | Rate  |
| ----------------------- | ----- |
| `pitch-voice`           | 10/10 |
| `pitch-not-a-denial`    | 10/10 |
| `pitch-substance`       | 10/10 |
| `no-forbidden-citation` | 1/1   |

Green, and worth recording precisely because of that: these are now the rows where a red is a
regression rather than a known weakness. The three nulls in each column are the empty drafts —
all three of this run's empty pitches were on `allowEmpty` cases, which is the prompt working.

`synthetic-pitch-no-overlap/pitch-availability-only` **failed on one run and passed on the
next**: the model cited `## Meeting availability` the first time and returned empty the second.
That is the trap doing its job and it is also a one-case demonstration of the variance section
below — run it with `EVAL_SAMPLES=3` before concluding anything from a single green.

`application-security-engineer-next-js-supabase/third-person-pitch` is fragile in a way worth
knowing: it expects `grounded: true`, and an unsupportable pitch has two honest outcomes —
empty text, which passes the guard, and uncited prose, which trips it. The case flips between
them run to run, so its `grounding-guard` row is noise rather than signal. `Expectation` has no
way to say "either", which is the real gap.

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

   **`golden.eval.ts` now asserts this, so the fast loop is red until it is decided.** That is
   deliberate: the name is injected rather than retrieved, so no citation check can see it and
   the pitch reads perfectly fluently with it — it would sit in this list forever otherwise. The
   assertion is `reads a plausible name out of the frozen profile`, and the one-line fix lives in
   `src/lib/profile/applicant-name.ts`.

5. **A long job description retrieves the CV's biographical sections, not its technical ones.**
   `buildPitchQuery` embeds the first 600 characters of the description plus the skill
   vocabulary, and on `pt-fullstack-developer-solutions-architect-for-a` — whose first two
   sentences say "multi-tenant SaaS solution" and "connects existing travel platform APIs" — it
   returns `Employment history`, `Mobile` and `Selected projects`, with every score inside
   0.64–0.68. Nothing discriminates. That job's pitch case then fails `cites-expected` on all
   three members of its group, and the retrieval lane carries it as a labelled ✗ rather than a
   relabelled ✓. A question retrieves fine on the same profile, so this is the pitch query's
   length, not the index.
6. **A pitch with nothing to say pitches the applicant's calendar.** On the first run of
   `synthetic-pitch-no-overlap/pitch-availability-only` — a COBOL, SAP ABAP and Solidity posting
   — the model wrote a full pitch and cited `## Meeting availability` among eight sources rather
   than returning the empty text the prompt asks for. `assembleAnswerEvidence` appends that block
   to a pitch as well as to a question, so it is always there to reach for. The case exists
   because this is the failure that survives the grounding guard: it is a real citation of real
   evidence, and it still says nothing about whether the applicant can do the work.

Two cases are deliberately **known red** and say so in their `notes`. A golden set with no red
rows is either measuring nothing or has been quietly bent to fit. The pitch lane's
`pt-fullstack…` retrieval label is red on the same principle and for the reason in finding 5.

## Lane B is not implemented, and that is a decision

The rubric checks that need a second model — "does this answer assert hands-on experience with
X?" and "does it answer the question asked?" — are **not** wired up. `mustNotClaim` is carried
into the JSON report so a judge can be added later without re-running anything.

A local judge grading a local drafter is correlated noise. Before it is built, hand-label ~15
cases and measure agreement; if it is poor, score on Lane A alone rather than publish a number
nobody trusts. Lane B must never gate.
