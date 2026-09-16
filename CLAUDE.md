# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fillix is a Manifest V3 Chrome extension with two core capabilities: **tool-augmented chat** (side panel) and **form auto-fill** (content script). All LLM inference runs locally via Ollama — there is no remote provider and no telemetry is ever sent. Models are entered by hand in Settings and verified with a **Test** button; the extension never queries Ollama for the list of installed models.

## Commands

- `pnpm install` — install deps
- `pnpm dev` — Vite dev server with HMR. Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on).
- `pnpm build` — typecheck + produce a production bundle in `dist/`
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
- **`src/sidepanel/`** — the primary UI surface, built with Svelte 5 (runes) plus shadcn-svelte primitives under `components/ui/`. Three tabs: **Chat** (streaming conversation with tool indicators), **News** (on-demand headlines, expand one to fetch and summarize it), and **Settings** (Ollama base URL, manual model list with per-model Test, system-prompt override).

- **`src/sidepanel/reconnecting-port.ts`** — the panel's port to the background. Chrome suspends the MV3 service worker (and force-closes its ports after ~5 min idle) while the panel stays open, so a port opened once at load is usually dead by the time the user types, and posting to a dead port throws. This wrapper connects lazily, reconnects on the next post, keeps subscribers across reconnects, and never throws. A reconnect cannot resume an interrupted stream — `onDisconnect` fires so `ChatTab` can end the turn with a worded error instead of spinning forever.

Shared code lives in `src/lib/`:

- `ollama.ts` — the **only** LLM client. `chatStream()` (NDJSON `/api/chat`), `generateStructured()` and `inferFieldValue()` (`/api/generate`, `format: 'json'`), and `testModel()` which runs one tiny generation and returns its latency. Structured prompts expect `{"value": "..."}` back; if parse fails, the field is skipped (empty string), **never** hallucinated text. There is deliberately no `listModels()` — see `legacy-migration.ts`.
- `forms.ts` — DOM detection + value setting. `FILLABLE_INPUT_TYPES` is an explicit allowlist (text-like types only). We skip `password`, `file`, `hidden`, `checkbox`, `radio`, `submit` etc. on purpose. Label resolution walks: `<label for>` → wrapping `<label>` → `aria-label` → `aria-labelledby`.
- `storage.ts` — typed wrapper over `chrome.storage.local` for the `ollama` (`OllamaConfig`), `models` (the hand-maintained `string[]`), `chat` (`ChatConfig`) and `news` keys. It holds persistence only: `chat.systemPrompt` is the user's **override**, and `''` means "no override" — `storage.ts` deliberately stores no copy of the default text.
- `system-prompt.ts` — resolves the effective chat system prompt. Imports `src/prompts/system.md` with Vite's `?raw`, so the default is inlined into the bundle at build time — no fetch, no emitted asset, no `web_accessible_resources` entry. `getSystemPrompt()` returns the stored override when it is non-blank and the packaged text otherwise; `chat-runner.ts` calls it, so the prompt never crosses the port and `CHAT_START` does not carry one. To change the default, edit the `.md` and rebuild.
- `legacy-migration.ts` — one-time, idempotent purges of retired `chrome.storage.local` keys: the multi-provider keys (`provider`, `providerConfigs`, `favoriteModels`), the `search` key that held the Brave key for the removed `web_search` tool, and the Obsidian-era keys (`obsidian`, `workflowsFolder`, `workflows`). Each retirement is its own function with its own gate. Runs from `background.ts` on install/startup. A stored non-Ollama config is dropped rather than migrated, and the `obsidian` key held a local REST API key — no credential survives the feature that needed it. The `chat` key is deliberately **not** purged: a system-prompt override the user typed is still theirs.

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

`host_permissions` in `manifest.config.ts` lists every endpoint the service worker is allowed to reach:

| Entry                        | Purpose                           |
| ---------------------------- | --------------------------------- |
| `http://localhost:11434/*`   | Ollama inference                  |
| `https://en.wikipedia.org/*` | `wikipedia` tool + News tab       |
| `https://hn.algolia.com/*`   | `news_feed` tool + News tab       |
| `<all_urls>`                 | `fetch_url` tool (arbitrary URLs) |

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
