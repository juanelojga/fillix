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
- **`src/sidepanel/`** — the primary UI surface, built with Svelte 5 (runes) plus shadcn-svelte primitives under `components/ui/`. Four tabs: **Chat** (streaming conversation with tool indicators), **News** (on-demand headlines, expand one to fetch and summarize it), **Workflows** (pick a playbook, press Capture; today the only playbook is **Toptal**, which reads a Toptal job page and shows its sections as decoded text, and refuses any other page), and **Settings** (Ollama base URL, manual model list with per-model Test, system-prompt override).

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

Inside `capture/`, `active-tab-html.ts` is the **only** module that
touches `chrome.*`; `injectable-url.ts` (which URLs Chrome refuses), `html-budget.ts` (the cap
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

The user's CV, project history and availability as one sectioned Markdown document, plus the
vectors that let a drafting step find the right sections per question. Authored by hand in the
Profile tab; no PDF parsing, no import.

- `chunk.ts` — splits on `##` headings, because that is the contract the Profile tab states to
  the user and counts back to them: a heading is both the retrieval key and the citation an
  answer carries, so the author picks the granularity. `###` deliberately does **not** split.
  The heading is prepended to each chunk's text before embedding — "Eight years." on its own
  scores against "Do you know Python?" on nothing at all. A section over `MAX_CHUNK_CHARS`
  splits on blank lines, never mid-paragraph, and a single over-long paragraph is emitted whole
  rather than cut.
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

Storage is three keys, deliberately separate. `profile` is the prose, `profileConfig` the
hand-named embed model, `profileIndex` the vectors — rewritten on different schedules and at
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

**Drafting (`src/lib/answers/`)**

Turns a captured job plus the profile into one answer per application question. Everything here
exists to stop one failure: a fluent, confident claim of experience the applicant does not have.
A wrong answer on a job application is not a bad summary — it is something a recruiter reads
aloud to a client.

- `answer-query.ts` — the text whose embedding retrieves the right sections. Not the question
  alone: "What is your experience with their stack?" names no technology, so on its own it
  retrieves whichever section is phrased most like a question. The job's skills are appended,
  **including the unclaimed ones**, because those are the likeliest to retrieve a gaps section.
- `job-context.ts` — the job, budgeted. The description is the only part that runs to thousands
  of characters, so it is what gets truncated; the attributes and the skill split are tiny and
  are what the answers turn on. Unclaimed required skills are named under an explicit "never
  imply experience with these" heading, because that is a far stronger instruction than leaving
  them to be inferred from an absence.
- `answer-prompt.ts` — in TS, not `src/prompts/`, by the rule above: it defines the JSON envelope
  its parser depends on. Evidence goes **last** in the user prompt, and that ordering is
  load-bearing — Ollama truncates an overflowing context from the _start_, so whatever leads is
  what gets silently dropped, and the applicant's own words must be the thing that survives.
- `draft-answer.ts` — `generateStructured` then `normalizeAnswerDraft`, the `news/summarizer.ts`
  shape. Passes `num_ctx: 8192` explicitly, because Ollama defaults to 2048 and truncates
  silently. **The guard the whole feature turns on lives here:** a non-empty answer with an empty
  `drew_on` is thrown away, because it was written out of the model's training rather than out
  of the profile. An empty answer with no citations is fine — that is the model correctly
  finding nothing, and the two must not be confused.
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
gaps). A question with no locator is **named, never dropped** — it is on the page whether or not
we can fill it, and a missing card reads as "Toptal did not ask this". `ApplicationDrafts.svelte`
owns the "Draft answers" button, which is deliberately not called Capture.

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
