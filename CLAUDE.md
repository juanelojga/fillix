# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fillix is a Manifest V3 Chrome extension with two core capabilities: **tool-augmented chat** (side panel) and **form auto-fill** (content script). All LLM inference runs locally via Ollama — there is no remote provider and no telemetry is ever sent. Models are entered by hand in Settings and verified with a **Test** button; the extension never queries Ollama for the list of installed models.

## Commands

- `pnpm install` — install deps
- `pnpm dev` — Vite dev server with HMR. Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on).
- `pnpm build` — produce a production bundle in `dist/` (it does **not** typecheck; that is `pnpm typecheck`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — run tests with vitest
- `pnpm eval` — grade answer drafting against the committed golden set. Needs a live Ollama, so it is deliberately **not** part of `pnpm test` and CI runs neither.
- `pnpm eval:derive` — rebuild `eval/cases/golden.json` from the raw captures in `eval/cases/incoming/`

## Architecture

Three extension contexts communicate via `chrome.runtime.sendMessage` and long-lived ports:

```
 content.ts (every page)    ──┐                        ┌── Ollama (localhost:11434)
                              ├──▶ background.ts ─────▶│
 sidepanel/main.ts (toolbar) ─┘      (service worker)  └── internet tools (wiki, news…)
   (port 'chat')
```

- **`src/content.ts`** — injected into every page at `document_idle`. Runs `detectFields()` and, if any are found, adds a fixed-position "Fillix: fill" button. Clicking it sends one `OLLAMA_INFER` message per field; fields are filled in-place via `setFieldValue` (dispatches `input`/`change` events so React/Vue form state updates).
- **`src/background.ts`** — service worker. The **only** context that makes outbound HTTP requests (Ollama and internet tools). Content scripts run in the page origin, so routing through the background gives a stable `chrome-extension://<id>` origin. In addition to `sendMessage` handling, it listens on one named port: `'chat'` (streaming ReAct chat loop via `chat-runner.ts`), which maintains its own `AbortController` for cancellation.
- **`src/sidepanel/`** — the primary UI surface, built with Svelte 5 (runes) plus shadcn-svelte primitives under `components/ui/`. Five tabs: **Chat** (streaming conversation with tool indicators), **News** (on-demand headlines, expand one to fetch and summarize it), **Workflows** (pick a playbook, press Capture; today the only playbook is **Toptal**, which reads a Toptal job page and shows its sections as decoded text, and refuses any other page), **Profile** (the CV document in Markdown, the hand-named embedding model with its own Test, the search-index build, and the Mon–Fri meeting-hours editor), and **Settings** (Ollama base URL, manual model list with per-model Test, system-prompt override).

- **`src/sidepanel/reconnecting-port.ts`** — the panel's port to the background. Chrome suspends the MV3 service worker (and force-closes its ports after ~5 min idle) while the panel stays open, so a port opened once at load is usually dead by the time the user types, and posting to a dead port throws. This wrapper connects lazily, reconnects on the next post, keeps subscribers across reconnects, and never throws. A reconnect cannot resume an interrupted stream — `onDisconnect` fires so `ChatTab` can end the turn with a worded error instead of spinning forever.

Shared code lives in `src/lib/`:

- `ollama.ts` — the chat and structured-generation client, and the only caller of `/api/chat` and `/api/generate`. `chatStream()` (NDJSON `/api/chat`), `generateStructured()` and `inferFieldValue()` (`/api/generate`, `format: 'json'`), and `testModel()` which runs one tiny generation and returns its latency. Structured prompts expect `{"value": "..."}` back; if parse fails, the field is skipped (empty string), **never** hallucinated text. There is deliberately no `listModels()` — see `legacy-migration.ts`. `extractOllamaError` is exported for `ollama-embed.ts`, which formats its HTTP failures identically so both diagnostics modules can match on one shape.
- `ollama-embed.ts` — the **embeddings** client, a sibling rather than a section of `ollama.ts`: a different endpoint, a different failure set, and a different model entirely. `embedTexts()` batches through `/api/embed` and falls back to the older singular `/api/embeddings` on a 404; it validates the row count and a uniform width, because a malformed reply produces an index that scores every query identically and by then the vectors are in storage. `testEmbedModel()` exists because `testModel()` POSTs `/api/chat`, which an embed-only model rejects outright — testing `nomic-embed-text` with it reports "not installed" for a model that is installed and working.
- `forms.ts` — DOM detection + value setting. `FILLABLE_INPUT_TYPES` is an explicit allowlist (text-like types only). We skip `password`, `file`, `hidden`, `checkbox`, `radio`, `submit` etc. on purpose. Label resolution walks: `<label for>` → wrapping `<label>` → `aria-label` → `aria-labelledby`.
- `storage.ts` — typed wrapper over `chrome.storage.local` for the `ollama` (`OllamaConfig`), `models` (the hand-maintained `string[]`), `chat` (`ChatConfig`), `newsConfig` (`NewsConfig`), `workflowsConfig` (`WorkflowsConfig`) and `news` keys. It holds persistence only: `chat.systemPrompt` is the user's **override**, and `''` means "no override" — `storage.ts` deliberately stores no copy of the default text. `newsConfig.model` follows the same convention, where `''` means "same as chat"; it is deliberately **not** a field inside `news`, because that key is the article cache and `setNewsCache` replaces it wholesale on every refresh. `workflowsConfig.playbook` is the Workflows tab's selected playbook, `''` meaning "never chosen" — and the `Config` suffix is load-bearing rather than decorative: the bare `workflows` key is one of the Obsidian-era names `legacy-migration.ts` purges on every install and startup, so a preference stored there would vanish on the next browser restart with nothing logged anywhere.
- `system-prompt.ts` — resolves the effective chat system prompt. Imports `src/prompts/system.md` with Vite's `?raw`, so the default is inlined into the bundle at build time — no fetch, no emitted asset, no `web_accessible_resources` entry. `getSystemPrompt()` returns the stored override when it is non-blank and the packaged text otherwise; `chat-runner.ts` calls it, so the prompt never crosses the port and `CHAT_START` does not carry one. To change the default, edit the `.md` and rebuild.
- `legacy-migration.ts` — one-time, idempotent purges of retired `chrome.storage.local` keys: the multi-provider keys (`provider`, `providerConfigs`, `favoriteModels`), the `search` key that held the Brave key for the removed `web_search` tool, and the Obsidian-era keys (`obsidian`, `workflowsFolder`, `workflows`). Each retirement is its own function with its own gate. Runs from `background.ts` on install/startup. A stored non-Ollama config is dropped rather than migrated, and the `obsidian` key held a local REST API key — no credential survives the feature that needed it. The `chat` key is deliberately **not** purged: a system-prompt override the user typed is still theirs. The Obsidian purge removes keys by **exact** name and must stay that way — `workflowsConfig` is a live setting one suffix away from the retired `workflows`.

**Playbooks (`src/lib/playbooks/`) and capture (`src/lib/capture/`)**

Together these back the Workflows tab, and the split is the point: `capture/` is the
**mechanism** (which tabs are injectable, the character budget, how a refusal is worded),
`playbooks/` is the **menu** of things the user can pick. `registry.ts` mirrors
`tools/registry.ts` — `PLAYBOOKS` is the picker's order and `resolvePlaybook(id)` takes a
`string`, not a `PlaybookId`, because the argument comes from storage and may be `''` or name
a playbook an older build wrote. A stranded tab is worse than silently landing on the default.

`toptal.ts` is the original Capture action and stays thin — a label, the empty-state prose, and
three lines composing `captureActiveTabHtml` with the two things that are Toptal's and nobody
else's, each in its own file: `toptal-job-url.ts` (which URLs are job pages) and
`toptal-job-sections.ts` (which parts of one are worth reading). Both change for their own
reasons — Toptal can move its routes without touching its markup, and the reverse.

**The brief.** `job-brief.ts` holds `JobBrief` and `SkillMention` and is deliberately free of
Toptal: a description, an attributes grid and a required/optional skill split are what every job
board has. `PlaybookResult` carries `brief: JobBrief | null`, so a playbook that reads something
other than a job posting simply returns null. Filling it is Toptal's business, split again by
reason to change: `toptal-job-attributes.ts` (the grid) and `toptal-job-skills.ts` (the chips),
composed by a ~15-line `toptal-job-brief.ts`.

`toptal-job-attributes.ts` reads the **decoded text**, because `readable-text.ts` already
flattens the grid to one line per cell. A label line is one that _ends_ with a colon, and that
the check is on the end is load-bearing: `Client's Hours:` is a label and `2:00 AM – 3:00 PM` is
a value, and both contain one.

`toptal-job-skills.ts` reads the **markup**, and that split is the point of the file. In the
decoded text a claimed skill reads `Python6` and an unclaimed one reads `Payment APIs`, so the
only available signal is "does this line end in a digit" — which misreads any skill whose name
ends in one (`Web3`, `Vue 3`, `GPT-4`) and would silently claim experience the user does not
have. In the markup the answer is explicit: `aria-disabled="true"` is Toptal greying out a skill
the profile lacks. That split is the **gaps signal** the whole grounding design leans on, so it
is worth a `DOMParser`. The number beside a claimed skill is a **connection count** — not years,
not a proficiency; it is displayed and never reasoned with. Chips are cloned before the count
node is removed, because other parsers read the same document afterwards.

The mechanism learns none of it. `captureActiveTabHtml` takes an optional `PageRequirement`
— a predicate plus the phrase naming the page it wanted — and refuses a mismatch as
`wrong-page` _before_ `findInjectionBlock`, which reads oddly until you try the other order:
on `chrome://extensions` "Chrome blocks chrome: pages, switch to an http:// tab" is true and
still not enough to succeed, while "open a Toptal job page" is complete advice in every case
the predicate rejects.

The run button says **Capture** whichever playbook is selected. That is not laziness: every
hint in `capture-diagnostics.ts` tells the user to "press Capture again", and those stay true
only while a button by that name is on screen. The picker carries the meaning, the button
carries the action.

Inside `capture/`, `injectable-tab.ts` and `active-tab-html.ts` are the only modules that
touch `chrome.*`; `injectable-url.ts` (which URLs Chrome refuses), `html-budget.ts` (the cap
and its wording), `capture-diagnostics.ts` (refusal → next step) and `readable-text.ts`
(a DOM subtree → text) are pure.

Unlike everything else here, the capture runs **in the sidepanel, not the background**, and
adds nothing to `Message`/`MessageResponse`. The rule that the worker owns outbound requests is
about network _origin_; `chrome.scripting` has no origin concern. Meanwhile
`chrome.tabs.query({ active: true, currentWindow: true })` is exact from the panel — the panel
is per-window — and degrades to a guess from a worker, which has no current window.

Two load-bearing details. `readDocumentHtml` is stringified by `chrome.scripting` and run in the
page, so it must close over nothing: the cap arrives through `args`, because a bundled
module-scope reference resolves to nothing in the page world. And it slices **there**, before
the structured clone, so a 12 MB document never crosses the boundary. Restricted URLs
(`chrome://`, the Web Store, `file://`, other extensions) are rejected _before_ injecting —
Chrome's own refusal is brittle to match on and unfit to show a user.

Decoding happens on this side of that boundary, not in the injected function:
`extractJobSections` parses the captured markup with `DOMParser`, which the panel has and the
worker does not, so the selector table and the walker stay ordinary testable modules instead of
being inlined into one string. `readable-text.ts` walks `textContent` rather than reading
`innerText` — a parsed document has no layout, and the blocks worth reading (a folded
description, a collapsed accordion) are exactly the ones CSS hides on the live page. It emits
`input`/`textarea`/`select` values too, because a form's answers live in `value` and not in any
text node; the flip side is the limit worth knowing: `outerHTML` serializes **attributes**, so a
value React set only as a property — anything the user typed and has not submitted — is not in
the capture and cannot be decoded out of it. A section whose hook is missing comes back
`found: false` and is named on screen, because `data-pendoid` is Pendo instrumentation and is
simply absent when Pendo is blocked.

`sidepanel/stores/playbook.ts` holds both the selected playbook and the last result, in one
store because they share one invariant: the displayed result always belongs to the displayed
playbook. Splitting them would make selection and running import each other, since
`selectPlaybook` must clear the result and `runPlaybook` must read the selection.

Only the **selection** is persisted, and only in `workflowsConfig`. The capture itself is
session-only: a page's full markup is the user's browsing content and nothing consumes it
across sessions. `selectPlaybook` clears via `clearRun()` rather than resetting the state
directly — `clearRun` bumps the generation counter, without which a run started under the
previous playbook resolves later and lands under the new one's label.

**Profile and retrieval (`src/lib/profile/`)**

The user's CV and project history as one sectioned Markdown document, plus the vectors that
let a drafting step find the right sections per question. Authored by hand in the Profile tab;
no PDF parsing, no import. Schedule is the one thing it does **not** hold — see **Meeting
availability** below.

- `chunk.ts` — splits on `##` headings, because that is the contract the Profile tab states to
  the user and counts back to them: a heading is both the retrieval key and the citation an
  answer carries, so the author picks the granularity. `###` deliberately does **not** split.
  The heading is prepended to each chunk's text before embedding — "Eight years." on its own
  scores against "Do you know Python?" on nothing at all. A section over `MAX_CHUNK_CHARS`
  splits on blank lines, never mid-paragraph, and a single over-long paragraph is emitted whole
  rather than cut.
- `applicant-name.ts` — who the third-person pitch is written about. Reads the preamble before
  the first `##`, which `chunk.ts` already documents as "usually the name and contact line", so
  it adds nothing for the user to maintain. Only the first non-blank line is a candidate: if
  that is not the name, nothing below it is either, and walking on would find the contact line
  or the summary's first sentence. Rejects a line with a `:` or over ~60 characters and returns
  `''`, which is a **supported answer** — `pitchSystemPrompt` says "The applicant" instead,
  because a wrong name in front of a recruiter is worse than a neutral one. The name is
  **injected, not embedded**: it reaches the prompt on `DRAFT_ANSWER` so that whether the pitch
  knows who it is about never depends on cosine similarity ranking the section carrying it.
- `profile-hash.ts` — FNV-1a 32-bit, **not** `crypto.subtle`: the digest APIs are async, and
  making staleness a promise would push `await` into the store, the tab's derived state and the
  status line. Not a security boundary; the worst a collision costs is one stale index. The
  embed model name is part of the hashed input, separated by a NUL.
- `index-staleness.ts` — `isIndexStale()`, pure, its own module. It is asked in the **panel** on
  every keystroke while building runs only in the **worker**, and keeping the two together made
  the panel import the embeddings client — and through it the whole chat client — to perform
  three string comparisons.
- `profile-index.ts` — `buildProfileIndex()`, worker-only by construction. Vectors are rounded
  to six decimals before storage: cosine is unaffected at that precision, while raw float64
  costs ~20 JSON characters per number against 9, which on a 40-chunk 768-dimension index is
  ~600 KB against ~275 KB of a 10 MB quota shared with the news cache. An empty profile throws
  `EmptyProfileError` rather than storing an index of nothing, which would read as fresh and
  quietly ground every answer in no evidence.
- `retrieve.ts` — `topChunks()`, pure like `news/interleave.ts`. Cosine, so magnitude cannot
  decide a ranking (a long section is not a more relevant one); a zero vector scores 0 rather
  than the NaN the division gives, because NaN compares false against everything and one of
  them scatters the sort. Ties fall back to the author's order, so rebuilding the same profile
  cannot reshuffle which section an answer cites. The best chunk is taken **even when it alone
  exceeds the budget** — returning nothing would make the model answer from thin air, which is
  the one outcome this whole design exists to prevent. A query vector of a different width
  yields `[]`: two embedding spaces have no relationship, so the scores would be confidently
  ranked noise.
- `retrieval-diagnostics.ts` — the four _configuration_ refusals plus the embed failure, each
  with a next step. Every hint names the Profile tab, because unlike the capture hints the
  button that fixes it is not on screen when the message appears.
- `embed-diagnostics.ts` — failure → worded cause and next step, same contract as
  `model-test-diagnostics.ts`. Two causes are unique to this path and are why it is not that
  module: naming a **chat** model as the embed model (where "not installed" would be actively
  misleading), and an Ollama old enough to have neither embeddings endpoint (where pulling a
  model would not help).

Storage is four keys, deliberately separate. `profile` is the prose, `profileConfig` the
hand-named embed model, `profileIndex` the vectors, `availability` the meeting hours — rewritten on different schedules and at
wildly different sizes, so an edit never rewrites a quarter-megabyte of floats and a failed
re-index leaves the prose intact. Embedding is an outbound request, so it runs in the worker
(`PROFILE_INDEX`, `TEST_EMBED_MODEL`); the vectors then live in storage and the panel scores
them locally, because shipping ~275 KB of floats through `sendMessage` per question would be
absurd. `MessageResponse` gains two keys: `indexed`, carrying only the counts the status line
prints, and `queryVector`, the one embedded question that does cross the port.

`retrieveProfileContext()` in `stores/profile.ts` refuses **before** embedding anything whenever
the index cannot be trusted — no model, empty profile, no index, stale index. That ordering is
load-bearing: `topChunks` also returns an empty list for an unusable index, and a silent empty
result is indistinguishable from "your CV says nothing about this", which is a very different
thing to tell someone applying for a job. A question the profile genuinely has nothing for is
`{ ok: true, chunks: [] }`; every other case is a typed failure with wording attached.

**Meeting availability (`src/lib/profile/availability*.ts`, `day-hours.ts`, `src/lib/answers/meeting-overlap.ts`)**

When the applicant can take a call, Monday to Friday. Structured rather than prose, and the
only part of the profile that is: schedule is the one question an application asks that has to
be **compared** against something the job page states, and a sentence cannot be intersected
with a time range.

What is stored is **the text the user typed** per weekday (`9am-1pm, 3-6pm`), not the ranges
parsed out of it. The parse is derived on every read, which costs nothing and buys two things:
a day the parser cannot read survives a reload so it can be corrected, and the field always
shows what was typed rather than a normalised rewrite of it under the cursor.

- `day-hours.ts` — one weekday of typed hours → merged ranges plus the fragments it could not
  read. A **sibling of `answers/time-range.ts`, and the split is the whole point**: that module
  parses what a job board rendered, which is always explicit (`2:00 AM – 3:00 PM`); this one
  parses what a person typed. Giving the board's value the benefit of the doubt would invent
  precision it already has, and refusing a person's typing any would make the field unusable.
  Two conventions live here and nowhere else: a named half-day governs a bare end (`3-6pm` is
  an afternoon, not the fifteen-hour `03:00–18:00` nobody typed), and a bare end earlier than
  the start is the same afternoon (`9-1` is a working day; `22-6` is left to wrap, because 22
  has no afternoon to move to). Neither applies when it would disorder the range, so an
  explicit `10pm-6am` still wraps. What is deliberately **not** guessed is `1-5` — both ends
  bare and already in order — because shifting both would invent a working day out of two
  digits. Nothing is ever approximated silently: every unreadable fragment comes back named as
  typed, and the editor prints it back.
- `availability.ts` — the shape, plus `dayRanges` and `describeRanges`. Also converts the
  earlier two-window-per-day shape on read rather than dropping it; the hours were the user's.
- `time-range.ts` (in `answers/`) — minutes from midnight, strict parsing of a _displayed_
  range, and `intersect`/`mergeRanges`. It exports `parseWrittenTime`, which reports whether
  the text named AM or PM, because what a bare `3` means is decided by the other end of the
  range and that judgment is `day-hours.ts`'s, not its own. `Minutes` lives here, in a module
  that imports nothing, so `profile/` and `answers/` both take it from a leaf.
- `meeting-overlap.ts` — the intersection, in integers. Computed here rather than asked of the
  model for the reason the whole `answers/` directory exists: a model asked to subtract two
  clock times produces a confident number, and a wrong overlap is a promise the applicant then
  has to keep. `typicalMinutes` is the **median** over the overlapping days only — one free
  Friday morning should not describe the week.
- `availability-text.ts` — the citable block. The `##` heading is not decoration:
  `answer-prompt.ts` tells the model `drew_on` holds the exact `##` headings it used and
  `draft-answer.ts` discards a non-empty answer that cites nothing, so an availability block
  without a heading would produce a correct answer the grounding guard then throws away.
  `Meeting availability`, deliberately not `Availability`, because the profile placeholder long
  suggested a section of that name and two of one name make a citation ambiguous. Returns `''`
  when no day reads — an empty section would be a claim of having no availability at all.
- `availability-evidence.ts` (in `answers/`) — the composer, and the only module that knows
  Toptal's `Client's Hours` label. **The overlap is dropped, and the hours kept, whenever the
  comparison cannot be trusted**: no brief, no attribute, an unparseable value, or a chosen
  timezone other than the browser's. That last one is why the label is worth a comment — a
  posting reading `Client's Hours: 2:00 AM – 3:00 PM` beside `Time Zone: Madrid, 7 hrs ahead`
  is a 9:00–22:00 Madrid day already converted into the _viewer's_ zone, which is the only
  reason an overlap is computable without knowing where the client is. Intersecting it with
  hours declared in a different zone would be wrong by exactly the offset between them.

`AvailabilityEditor.svelte` is five text fields and nothing to enable first. It **echoes the
parse back under every field**, and that is the safety net the free-text input rests on: the
parser gives `9-1` the benefit of the doubt, so the only honest way to offer that is to show
the reading where a wrong one is visible immediately rather than surfacing in an answer a
recruiter has already read. `stores/availability.ts` has no draft copy and no Save button,
unlike `stores/profile.ts`: every keystroke is the user's final word, so each one writes
through to storage at once. Sharing the profile's Save button would put one control in charge
of two things with different staleness rules. The zone is **seeded** from the browser on first
hydrate and never overwritten after.

These hours are **injected, not embedded**. `application.ts` appends the block to `evidence`
rather than letting retrieval find it, so a schedule answer never depends on cosine similarity
ranking the right section — and it is charged against `EVIDENCE_CHARS` rather than added on top.
It goes **last**, because Ollama truncates an overflowing context from the start. The knock-on
is the reason the editor says so on screen: editing an hour does **not** make the vector index
stale, which is the opposite of how the Markdown box above it behaves. `SHARED_RULES` carries
one line for this — times and hour counts in the excerpts are already correct and must not be
recalculated — because the overlap arrives as a computed fact the model would otherwise re-derive.

**Times inside the question (`src/lib/answers/zone-offset.ts`, `mentions-time.ts`, `question-times.ts`,
`extract-question-times.ts`, `question-schedule.ts`, `local-window.ts`, `schedule-check.ts`,
`schedule-text.ts`, `schedule-summary.ts`)**

The block above answers "what are your hours". This answers the other half: a form that states
times _in the question_ — three dated interview slots, or a client's business day in a named
city — and asks whether they work. `Client's Hours` in the attributes grid is the only time a
playbook parses; everything a question says is prose until it comes through here.

**The model extracts; the code computes, and nothing crosses that line.** The extraction call is
asked only to copy dates, clock times and zone names out of a sentence into fields — never to
convert one, never to say which weekday a date falls on, never to rule on anything. Every
verdict is integer arithmetic in `schedule-check.ts`, for the reason `meeting-overlap.ts`
already states and this inherits: a model asked whether 5pm in Madrid suits someone in Guayaquil
answers confidently, and a wrong answer is an interview the applicant does not show up to.

That division is also why it generalises. A regex handles the phrasings we wrote rules for; a
form that renders its slots as a table, or in Spanish, or as `Tue the 22nd, 5:30-7:30 CEST`, is
the same extraction problem and a different regex problem. What keeps it honest is that nothing
the model emits is believed on its own — `normalizeQuestionTimes` re-parses every field, and an
entry that fails validation is demoted to `unreadable` under its own `source` rather than
repaired into something plausible.

- `mentions-time.ts` — the gate, and deliberately a loose one. The two errors are not
  symmetric: a false positive costs one small generation that returns empty, a false negative
  silently skips the check on a question that needed it and the answer still gets written.
- `zone-offset.ts` — **the only module in this path entitled to convert anything**, which is why
  `time-range.ts`'s claim that nothing there converts stays true. Everything goes through a real
  instant: a wall clock plus a zone becomes a `Date`, and that `Date` is read back as a wall
  clock in the applicant's zone. Both halves are asked of `Intl`, which owns the DST tables.
  Subtracting two offsets instead would be wrong twice — across a DST boundary, and whenever the
  converted time lands on a different calendar day than the one the question named.
- `question-times.ts` — the prompt and the envelope its parser depends on, so it is TS and not
  `src/prompts/`, by the rule above. A zone is copied verbatim when the text gives an offset and
  given as an IANA id when it names a place: re-deriving `GMT+02:00` from `Europe/Madrid` would
  invent a DST opinion the question did not express, and the two disagree for half the year.
- `local-window.ts` — the conversion, split out of `schedule-check.ts` the moment a second
  caller appeared, exactly as `injectable-tab.ts` was split out of `active-tab-html.ts`. A dated
  slot and a recurring client day are different things to _report_ and identical things to
  _convert_, and a second copy of the conversion would drift silently and be wrong by an hour
  twice a year. A window is split at **local** midnight and each half checked against the day it
  actually fell on, because 12:00–16:00 in Tokyo is 22:00 Monday to 02:00 Tuesday in Guayaquil
  and no single weekday describes it. A weekend lands on `day: null` and matches nothing.
- `schedule-check.ts` — the verdicts on top of it: the statuses, the per-day rollup, and which
  mentions come back uncompared with a reason attached. Unlike `draft-answer.ts` there is **no guard that discards a response** —
  there is nothing to guard against, since the failure this path produces is a _wrong time_ and
  no property of the JSON reveals one. The defence is the re-validation and the card instead.
- `question-schedule.ts` — the panel-side orchestrator, and **every failure in it returns null,
  which is not an error**. The drafting path carries on with the weekly hours alone, exactly as
  it does for an unparseable `Client's Hours`. It refuses before spending a generation when the
  question names no time, when no hours are stored, and — the load-bearing one — when neither
  the profile nor the browser names a zone, since there is then nothing to convert _into_.
- `schedule-text.ts` / `schedule-summary.ts` — the same check for two readers. The first writes
  prose inside the `## Meeting availability` heading, where completeness matters and length is
  cheap; the second writes labels for someone scanning a narrow panel, where the only thing that
  matters is that a wrong reading is obvious. Both pair the question's own words with the
  converted result, so checking a verdict never means re-reading the answer.

A zone the question did not state, or one this browser cannot place, is **named and not
compared** — `availability-evidence.ts`'s existing rule, extended: saying "here are my hours" is
always true, and "that slot works" has to be earned. Those mentions reach the model in the
applicant's own voice ("I have not checked these…"), because silence is what lets a model fill
the gap from its training.

The check is appended **inside** the existing `## Meeting availability` block rather than under
a heading of its own, and `buildAvailabilityEvidence` returns `''` untouched when no hours are
stored. Both are the same constraint: `draft-answer.ts` discards a non-empty answer whose
`drew_on` is empty, so an appended block with no heading above it would throw away a correct
answer. Extraction is an outbound request and so belongs to the worker
(`EXTRACT_QUESTION_TIMES`); everything after it is pure and stays in the panel, which already
holds the availability — sending the hours to the worker so it could send a verdict back would
put the one computation this feature exists to protect on the far side of a message boundary.

**Drafting (`src/lib/answers/`)**

Turns a captured job plus the profile into one answer per application question. Everything here
exists to stop one failure: a fluent, confident claim of experience the applicant does not have.
A wrong answer on a job application is not a bad summary — it is something a recruiter reads
aloud to a client.

- `answer-query.ts` — the text whose embedding retrieves the right sections. Not the question
  alone: "What is your experience with their stack?" names no technology, so on its own it
  retrieves whichever section is phrased most like a question. The job's skills are appended,
  **including the unclaimed ones**, because those are the likeliest to retrieve a gaps section.
  `buildPitchQuery` is the pitch's version and takes no question at all: the pitch field's label
  is a UI string, so embedding it would retrieve whichever section reads most like a form field.
  It retrieves on the job — the description's opening plus the same vocabulary — because what a
  pitch needs is "which of my sections make the best case for this role". `answer-evidence.ts`
  picks between the two on `kind`, which is why `EvidenceRequest.kind` is required and not
  defaulted: a caller that forgets would silently ground a pitch in the wrong half of the CV.
- `job-context.ts` — the job, budgeted. The description is the only part that runs to thousands
  of characters, so it is what gets truncated; the attributes and the skill split are tiny and
  are what the answers turn on. Unclaimed required skills are named under an explicit "never
  imply experience with these" heading, because that is a far stronger instruction than leaving
  them to be inferred from an absence.
- `answer-prompt.ts` — in TS, not `src/prompts/`, by the rule above: it defines the JSON envelope
  its parser depends on. Evidence goes **last** in the user prompt, and that ordering is
  load-bearing — Ollama truncates an overflowing context from the _start_, so whatever leads is
  what gets silently dropped, and the applicant's own words must be the thing that survives.
  `SHARED_RULES` carries **grounding only**. Voice and the shape of an unsupported answer are
  deliberately per-prompt, because the two disagree about both, and keeping either shared is
  what made the pitch inherit the wrong voice for as long as it did. A question is first person
  and, when nothing supports it, gets the bare one-sentence denial. `pitchSystemPrompt(name)` is
  **third person** — Toptal's box says "Write your third-person pitch here" and the checkbox
  beside it says a recruiter forwards the text to the client, so it is the one field where the
  voice is stated on screen. The name comes from `profile/applicant-name.ts`; `''` becomes "The
  applicant", never a guess. An unsupportable pitch returns an **empty** `text` rather than a
  denial: an empty answer already passes the grounding guard and already renders as "your
  profile had nothing for this one", while "The applicant has no experience with this" is not
  something to write into a pitch box — and being third person it would not match the
  first-person `NEGATION` in `states-no-experience.ts` and would be discarded anyway. The pitch's
  user prompt carries `PITCH_BRIEF` in the slot a question's text occupies, encoded here rather
  than scraped: Toptal prints that brief above the box behind no `data-testid`, and depending on
  unhooked prose is the exact failure this design keeps hitting.
- `draft-answer.ts` — `generateStructured` then `normalizeAnswerDraft`, the `news/summarizer.ts`
  shape. Passes `num_ctx: 8192` explicitly, because Ollama defaults to 2048 and truncates
  silently. **The guard the whole feature turns on lives here:** a non-empty answer with an empty
  `drew_on` is thrown away, because it was written out of the model's training rather than out
  of the profile. The **one** exception is a bare statement of having no experience, which is
  what the prompt now asks for in place of a blank — it claims nothing, so there is nothing for
  a citation to support. `states-no-experience.ts` decides what counts. `noExperience` on the
  draft is **derived here**, never read off the wire: a self-reported flag is one a small model
  drops under a long prompt, and its absence would then mislabel a correct answer. It cannot be
  true when anything was cited. An empty answer still passes, but it is now a tolerated
  shortfall rather than the requested outcome.
- `states-no-experience.ts` — whether an uncited answer is a bare denial. The **mirror image of
  `mentions-time.ts`**, whose gate is loose because a false positive there costs one small
  generation; here a false positive costs an uncited claim in front of a recruiter, so it is
  strict and returns false when in doubt. The checks are structural, not about tone — short
  enough to be one sentence, the negation in the _first_ sentence, and no year and no tenure —
  because the answer to catch is not "I am a Square expert" (a confused model, rare) but the
  mixed one that opens with a negation and then invents an employer and a date. It is also why
  the prompt no longer invites "then say what the nearest real experience is" unconditionally:
  that clause is only honest when an excerpt supports it and is cited.
- `draft-diagnostics.ts` — failure → cause and next step. The `ungrounded` arm is checked first
  and is worded as the guard firing rather than as a bug, because it is the one failure that is
  working as designed.

`stores/application.ts` holds the questions and their drafts, a sibling of `stores/playbook.ts`
rather than part of it — one store holds what the page _is_, the other what we propose to write
back. It carries the same invariant across the boundary by keying every in-flight draft on the
capture's `capturedAt`, so a slow answer for the previous job cannot land under this one's
question. Drafting is **sequential**: Ollama serialises generation on one model anyway, so firing
eight at once would not finish sooner — it would only make every question appear to hang at once.

`AnswerCard.svelte` shows the answer in an editable box plus the two things that make it
checkable in one glance: _Drew on_ (the cited headings) and _Not in your profile_ (the declared
gaps). A `noExperience` draft gets a third branch that says the answer **cites nothing**, not
merely that the question touched a gap — that wording is the only thing standing between the
user and a short uncited sentence that reads like a denial while still claiming something, and
for the same reason the footer under the list promises a citation _or_ a stated gap, never a
citation on every answer. It also warns when a draft falls under `field.minChars` — Toptal
refuses a pitch under 180 characters. That is said **here and never asked of the model**: the
prompt carries no length target, because a model given one pads an answer it cannot support,
which is the fabrication `answer-prompt.ts` exists to stop. A grounded pitch clears the floor on
its own, so the warning only ever fires on one the user has to finish. A question with no locator is **named, never dropped** — it is on the page whether or not
we can fill it, and a missing card reads as "Toptal did not ask this". `ApplicationDrafts.svelte`
owns the "Draft answers" button, which is deliberately not called Capture.

**Filling (`src/lib/capture/`)**

`injectable-tab.ts` owns the pre-flight — active tab → the playbook's `PageRequirement` →
`findInjectionBlock` → `status === 'complete'` — and the `CaptureFailure` / `PageRequirement`
types with it. It was lifted out of `active-tab-html.ts` the moment a second caller appeared:
reading a page and writing to it need the same checks in the same order, and the order is
load-bearing, so a second copy would drift silently. `active-tab-html.ts` re-exports both types,
since it is still the entry point callers import from.

`fill-active-tab.ts` writes approved answers back. Like the capture it runs from the **panel**,
and it re-runs the whole pre-flight rather than trusting the capture's: the user may have
switched tabs between drafting and pressing Fill, and writing a pitch into whatever happens to be
open now is the worst thing this feature could do.

`writeFields` runs in the page and closes over nothing, like `readDocumentHtml`. Three details
are load-bearing:

- **It assigns through the prototype's `value` setter, never `el.value = text`.** React installs
  a `_valueTracker` on controlled inputs; a direct assignment updates that tracker as a side
  effect, so when the `input` event arrives React compares against it, sees no change and drops
  the event — the box shows the text and the form submits empty. This is why `setFieldValue`
  could not simply be copied across the injection boundary: the twin had to differ in substance,
  not just in imports. (`forms.ts` still does the direct assignment, so the content script has
  the same latent bug on React sites. Out of scope here.)
- **It skips `aria-hidden` and `readonly` controls**, because the autosize measuring twin
  carries the _same name_ — `getElementsByName` returns it too, and a value written there is
  invisible to the user and to the form.
- **An ordinal counts inside the form the anchor belongs to**, not document-wide, because that
  is where the parser counted. The anchor selector is passed in by the playbook
  (`APPLICATION_FORM_ANCHOR`), so the mechanism still knows nothing about Toptal.

It can never press Submit: the only elements it writes to are text inputs and textareas, and a
submit button is neither.

`toptal-application-form.ts` walks the captured form into `ApplicationField`s. Which element
**is** the pitch lives next door in `toptal-pitch-field.ts`, split out by the reason that split
`toptal-job-url.ts` from `toptal-job-sections.ts` — and split because it has already changed
underneath us once. Toptal renamed the hook from `pitchThirdPersonLabel` to `pitchInput`,
relabelled the box from "Relevant experience (optional)" to "Write your third-person pitch here",
renamed the control from `comment` to `pitch` and gave it a stated minimum length. The old
selector matched nothing, so the pitch simply never appeared and **nothing said why** — every
piece downstream of it already worked. Both hooks are now matched, because nothing here can know
which build an account is served.

Three things follow from that failure. `PITCH_QUESTION` is a stable label (`Third-person pitch`),
deliberately **not** the page's wording: it is the `drafts` map key and the `{#each}` key, so it
must not move when Toptal rewords a label — which is precisely what Toptal did. `pitchMinChars`
reads the number the page prints ("Write minimum 180 characters") rather than assuming it, and
falls back to the known floor rather than to 0, because warning with a stale number beats not
warning. And `findFallbackPitch` finds the box by **shape** when neither hook matches — a
fillable textarea inside the form but outside `matcherQuestions` is structurally the pitch. It
returns every candidate rather than the first, because the caller has to tell three cases apart:
none (plenty of applications genuinely have no pitch box, and warning there is a false alarm),
one (that is it), and several (guessing would write a pitch into the wrong box, so the field is
named as unfillable through the existing `locator: null` card and the user writes it by hand).

`fill-outcome.ts` words a per-field miss in place. Whole-run refusals reuse
`diagnoseCaptureFailure` unchanged, which stays honest because every hint it gives says "press
Capture again" and that button is still on screen.

**Tools (`src/lib/tools/`)**

- `registry.ts` — `dispatchTool(name, args)` router; maps tool names to implementations.
- `wikipedia.ts` — Wikipedia REST API page summary (first 500 chars + URL); no key required.
- `news-feed.ts` — top-5 Hacker News headlines for a query, formatted for the ReAct loop; no key required. A thin wrapper over `news/hacker-news.ts`; it used Google News RSS until that needed `DOMParser`, which does not exist in a service worker.
- `fetch-url.ts` — HTTP fetch → stripped plain text (3 000-char cap, 15 s timeout); validates `http`/`https` URLs.

**News (`src/lib/news/`)**

Backs the News tab. `aggregator.ts` fans four sources out in parallel with
`Promise.allSettled` (never `all` — one dead source must not empty the tab), then
`interleave.ts` round-robins and dedupes them down to 6 items. Hacker News covers AI,
Technology and Software development; the Wikipedia featured feed covers Curiosities. Both
are JSON, so nothing here needs a DOM.

The News tab has its own summary model, stored under `newsConfig` and picked from the tab
header. `''` means "same as chat", so nothing changes until the user picks one.
`lib/news/summary-model.ts` is the only place that convention is interpreted; the **sidepanel**
resolves it and sends the result on `NEWS_SUMMARIZE`, rather than the worker re-reading
storage. That is load-bearing: the panel needs the same value for its "Summarizing with X"
label and for `diagnoseSummaryFailure`, and it captures it before the two round trips, so
those can never name a model that did not run.

Refresh costs **zero LLM calls** — collapsed rows render text the feed already provided.
The model only runs when the user expands a row: `article-text.ts` decides whether the feed
snippet suffices or the article must be fetched, and `summarizer.ts` calls
`generateStructured`. `article-text.ts` rejecting unusable text is load-bearing — `fetchUrl`
signals failure by _returning_ `"Error: ..."` strings, and handing one to the model produces
a confident summary of an HTTP error.

Google News is deliberately not a source: its RSS `<link>`s are opaque JS redirect pages and
its `<description>` just repeats the title, so neither the article URL nor a summary is
recoverable.

**Chat**

- `chat-runner.ts` — ReAct tool-use loop (max 8 iterations). Each iteration: stream LLM tokens → scan response for `{"tool":"<name>","args":{…}}` JSON line → dispatch tool → emit `tool-call`/`tool-result` port messages → append result to messages → loop. Exits early when no tool call is detected. It also resolves the system prompt: `TOOL_SYSTEM_PROMPT` always leads, then whatever `getSystemPrompt()` returns. Tool instructions are not the user's to switch off, so an override replaces the packaged prose but never the tool block.

**Prompts (`src/prompts/`)**

Every prompt the user can change lives here as Markdown, bundled with `?raw`. Today
that is `system.md` (the chat system prompt). Prompts that are part of a mechanism
rather than a preference stay in TS next to their caller — `TOOL_SYSTEM_PROMPT` in
`chat-runner.ts`, the summarizer prompt in `news/summarizer.ts`, the field-inference
prompt in `ollama.ts` — because changing them changes how the code parses the reply.

`src/types.ts` is the cross-context message contract. It defines `OllamaConfig` (`baseUrl`, `model`) and the `PortMessage` union used for streaming — including `tool-call` and `tool-result` variants that carry tool name and args/result. When adding a new message kind, update `Message` **and** `MessageResponse`, and add a `case` in `background.ts`'s `handle` — TypeScript's exhaustiveness check will flag the rest.

**Evals (`eval/`)**

Outside `src/`, because `src/**/*.ts` is the coverage `include` and because the two vitest
configs share no glob — `pnpm test` can never pick up a file that talks to a live Ollama, and
`pnpm eval` can never pick up a unit spec.

The whole drafting design exists to stop one failure: a fluent, confident claim of experience
the applicant does not have. The unit specs test the **guard** (`normalizeAnswerDraft`,
`statesNoExperience`, the diagnostics); nothing in them tests the **model**. `eval/` is what
makes changing the system prompt, the evidence budget or the model a measurable change instead
of one the suite stays green through either way.

`eval/cases/golden.json` is the committed golden set: `jobs[]` and `cases[]` cross-referenced by
`jobId` so a description is written once and shared by its questions. It is **derived, not
authored** — `pnpm eval:derive` runs the production parsers over `eval/cases/incoming/*.html`
(gitignored; Toptal deletes the form on Submit, so the captures are perishable twice over) and
merges the result into the existing file, carrying every hand-authored `archetype`, `expect` and
`notes` across by case id. That merge is load-bearing: a derivation that reset the labels would
be run once and never again. The inversion is the point — the JSON outlives the HTML, so a
posting deleted tomorrow still grades a model next year.

No client is pseudonymized because Toptal never names one — verified across all eight captures:
the Company Information block carries only a country, a founding year, a team size and an
industry, and every description says "our client". Technologies and vendors are kept **verbatim**,
since they are exactly what grounding is graded on. What is scrubbed is the applicant's identity,
through the gitignored `eval/scrub/identities.local.json`.

`eval/scrub/pii-scan.ts` walks a parsed value rather than its serialization, and that is not
pedantry: the patterns allow whitespace and punctuation as separators, and pretty-printed JSON
supplies both between every field, so a `phone` match straddles two unrelated keys. Scanning
`JSON.stringify(set)` reported fifty-two phone numbers, every one of them a frozen ISO date.

`eval/golden.eval.ts` is the fast loop — no Ollama, about a second — and it exists because a
golden set whose checks are unmeetable reports a bad _file_ in the same shape as a bad _model_.
So it makes the silent traps loud: a `mustCiteAny` heading that is not in the profile (nothing
can ever return it), a `scheduleUsed: true` on a question `mentionsTime()` would refuse, a
denial whose `maxChars` exceeds what `statesNoExperience` accepts, and the three overlap
preconditions that otherwise give hours-only evidence while the expectation waits for an overlap
nobody computed.

`eval/lib/draft-case.ts` reuses `assembleAnswerEvidence` rather than reimplementing
`draftOne` — the budget, the availability block's position and the `'\n\n---\n\n'` separator
live there, and a copy of those twenty lines is exactly the drift that would grade a pipeline
the extension does not run. Its `QuestionTimesSource` round-trips through
`JSON.parse(JSON.stringify(times))` on purpose, reproducing the port rather than shortcutting it.

**`mustNotClaim` is deliberately not auto-seeded from `missingRequiredSkills`.** Toptal's
`onProfile` flag describes its own profile's skill list and disagrees with the CV in ten places
across the eight captures — it marks FastAPI and A/B Testing missing while the CV has a section
for each. `golden.eval.ts` prints every disagreement rather than asserting on it. It is also why
`mustNotClaim` (judged) and `mustNotMention` (substring) are separate fields: one real capture
asks _"is there any required skill you are missing?"_, where naming the skill is the correct
answer, and no substring check can tell that from claiming it.

`cites-retrieved` in `eval/lib/grade-draft.ts` is the check production **structurally cannot**
run — the guard only tests that `drew_on` is non-empty, so an answer citing a section it was
never shown passes in the extension today. `citation-format` is split off from it because a
model that quotes the paragraph it used has not hallucinated, it has formatted a true citation
badly, and the two do not have the same fix.

See `eval/README.md` for how to run it, the environment overrides, and what each check means.

## Build tooling

`@crxjs/vite-plugin` reads `manifest.config.ts` (typed via `defineManifest`) and wires HMR for all extension contexts. To add a script/page (e.g. options page), add it to `manifest.config.ts`; crxjs handles the Vite input entries automatically.

`permissions` in `manifest.config.ts` carries `scripting` for the Workflows tab's playbooks. `activeTab` cannot replace it: it grants neither the `chrome.scripting` namespace nor a
host grant that survives a click on a button _inside the side panel_ — only a click on the
extension's action mints one, for whichever tab was active at that instant. The injection is
authorized by the standing `<all_urls>` entry below instead.

`host_permissions` in `manifest.config.ts` lists every endpoint the service worker is allowed to reach:

| Entry                        | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `http://localhost:11434/*`   | Ollama inference                      |
| `https://en.wikipedia.org/*` | `wikipedia` tool + News tab           |
| `https://hn.algolia.com/*`   | `news_feed` tool + News tab           |
| `<all_urls>`                 | `fetch_url` tool + playbook injection |

Pointing the Ollama base URL somewhere other than `http://localhost:11434` requires adding that origin here **and** reloading the extension — a runtime `baseUrl` without a matching permission entry will fail silently.

## Setup

### Ollama

Ollama is the only backend. Worth stating explicitly when the user reports "nothing happens":

1. `ollama serve` running, with at least one model pulled (default in `storage.ts` is `llama3.2`).
2. `OLLAMA_ORIGINS=chrome-extension://*` in the environment Ollama runs under — otherwise the preflight/origin check rejects the extension's requests. On macOS this is `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart the Ollama app.

3. The model name in Settings must match `ollama list` exactly (tag included, e.g. `qwen3:8b`). Nothing validates it on entry — hitting **Test** next to the model is what surfaces `model "…" not found`.

## Conventions

- Strict TS everywhere. No `any`; prefer discriminated unions (see `MessageResponse`).
- Don't add dependencies for trivial utilities — keep bundle size and attack surface down. The sidepanel is Svelte 5 + shadcn-svelte; reach for an existing `components/ui/` primitive before adding a library.
- The content script runs on every URL the user visits. Keep it cheap and side-effect-free until the user clicks the button. Do not read page text or storage on load, and do not register a `chrome.runtime.onMessage` listener — `content.ts` is a button, not an RPC target.
- **SOLID — single responsibility always.** Each module must have one reason to change. When a new concern is introduced, extract it to its own file rather than adding it to an existing one. The pattern is thin orchestrators (`background.ts`, `sidepanel/main.ts`) importing from focused `lib/` modules (`chat-runner.ts`, `system-prompt.ts`, `news/aggregator.ts`). If a file exceeds ~150 lines and mixes concerns, split it before adding more.
- **File names must describe what the module does, not when it was created.** No sprint numbers, ticket IDs, or sequence suffixes in file names (e.g. `chat-runner.ts`, not `background-sprint4.ts`). Test files mirror the module they test: `chat-runner.spec.ts` tests `chat-runner.ts`.
