# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fillix is a Manifest V3 Chrome extension with two core capabilities: **form auto-fill** (content script + agentic pipeline) and **tool-augmented chat** (side panel). All LLM inference runs locally via Ollama — there is no remote provider and no telemetry is ever sent. Models are entered by hand in Settings and verified with a **Test** button; the extension never queries Ollama for the list of installed models.

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
                              ├──▶ background.ts ─────▶│   OpenAI / OpenRouter / custom
 sidepanel/main.ts (toolbar) ─┘      (service worker)  └── internet tools (search, wiki…)
   (port 'chat' | 'agent')
```

- **`src/content.ts`** — injected into every page at `document_idle`. Runs `detectFields()` and, if any are found, adds a fixed-position "Fillix: fill" button. Clicking it sends one `OLLAMA_INFER` message per field; fields are filled in-place via `setFieldValue` (dispatches `input`/`change` events so React/Vue form state updates).
- **`src/background.ts`** — service worker. The **only** context that makes outbound HTTP requests (LLM providers and internet tools). Content scripts run in the page origin, so routing through the background gives a stable `chrome-extension://<id>` origin. In addition to `sendMessage` handling, it listens on two named ports: `'chat'` (streaming ReAct chat loop via `chat-runner.ts`) and `'agent'` (5-stage form-fill pipeline via `agent-runner.ts`). Each port maintains its own `AbortController` for cancellation.
- **`src/sidepanel/`** — the primary UI surface, built with Svelte 5 (runes) plus shadcn-svelte primitives under `components/ui/`. Three tabs: **Agent** (workflow selector + pipeline), **Chat** (streaming conversation with tool indicators), and **Settings** (Ollama base URL, manual model list with per-model Test, Brave Search key, Obsidian config, profile).

Shared code lives in `src/lib/`:

- `ollama.ts` — the **only** LLM client. `chatStream()` (NDJSON `/api/chat`), `generateStructured()` and `inferFieldValue()` (`/api/generate`, `format: 'json'`), and `testModel()` which runs one tiny generation and returns its latency. Structured prompts expect `{"value": "..."}` back; if parse fails, the field is skipped (empty string), **never** hallucinated text. There is deliberately no `listModels()` — see `legacy-migration.ts`.
- `forms.ts` — DOM detection + value setting. `FILLABLE_INPUT_TYPES` is an explicit allowlist (text-like types only). We skip `password`, `file`, `hidden`, `checkbox`, `radio`, `submit` etc. on purpose. Label resolution walks: `<label for>` → wrapping `<label>` → `aria-label` → `aria-labelledby`.
- `storage.ts` — typed wrapper over `chrome.storage.local` for `profile`, `ollama` (`OllamaConfig`), `models` (the hand-maintained `string[]`), and `search` (`SearchConfig`) keys.
- `legacy-migration.ts` — one-time, idempotent cleanup of the retired multi-provider keys (`provider`, `providerConfigs`, `favoriteModels`). Runs from `background.ts` on install/startup. A stored non-Ollama config is dropped rather than migrated, so no remote API key survives the upgrade.

**Tools (`src/lib/tools/`)**

- `registry.ts` — `dispatchTool(name, args, searchConfig)` router; maps tool names to implementations.
- `web-search.ts` — Brave Search API (`api.search.brave.com`); requires `braveApiKey` in `SearchConfig`; returns top-5 results.
- `wikipedia.ts` — Wikipedia REST API page summary (first 500 chars + URL); no key required.
- `news-feed.ts` — Google News RSS headlines for a query; no key required; returns top-5 items.
- `fetch-url.ts` — HTTP fetch → stripped plain text (3 000-char cap, 15 s timeout); validates `http`/`https` URLs.

**Chat / Agent pipeline**

- `chat-runner.ts` — ReAct tool-use loop (max 8 iterations). Each iteration: stream LLM tokens → scan response for `{"tool":"<name>","args":{…}}` JSON line → dispatch tool → emit `tool-call`/`tool-result` port messages → append result to messages → loop. Exits early when no tool call is detected.
- `pipeline.ts` — per-stage LLM calls: `runUnderstand`, `runPlan`, `runDraft`, `runReview`.
- `agent-runner.ts` — 5-stage form-fill pipeline orchestrator (collect → understand → plan → draft → review); emits `AGENTIC_STAGE`, `AGENTIC_CONFIRM`, `AGENTIC_COMPLETE`, `AGENTIC_ERROR` port messages; supports `AbortSignal` for cancellation.
- `agent-log.ts` — `redact()` strips API keys/tokens from log strings; `buildRunHeader()` and `buildStageEntry()` format Obsidian Markdown run logs with collapsible detail blocks.
- `field-normalizer.ts` — `normalizeDraft()`, `normalizeReview()`, `buildFieldFills()` convert raw LLM JSON into typed `FieldFill[]`.

`src/types.ts` is the cross-context message contract. It defines `OllamaConfig` (`baseUrl`, `model`), `SearchConfig` (`braveApiKey?`), and the `PortMessage` union used for streaming — including `tool-call` and `tool-result` variants that carry tool name and args/result. When adding a new message kind, update `Message` **and** `MessageResponse`, and add a `case` in `background.ts`'s `handle` — TypeScript's exhaustiveness check will flag the rest.

## Build tooling

`@crxjs/vite-plugin` reads `manifest.config.ts` (typed via `defineManifest`) and wires HMR for all extension contexts. To add a script/page (e.g. options page), add it to `manifest.config.ts`; crxjs handles the Vite input entries automatically.

`host_permissions` in `manifest.config.ts` lists every endpoint the service worker is allowed to reach:

| Entry                            | Purpose                           |
| -------------------------------- | --------------------------------- |
| `http://localhost:11434/*`       | Ollama inference                  |
| `http://localhost:27123/*`       | Obsidian local API                |
| `https://api.search.brave.com/*` | `web_search` tool                 |
| `https://en.wikipedia.org/*`     | `wikipedia` tool                  |
| `https://news.google.com/*`      | `news_feed` tool                  |
| `<all_urls>`                     | `fetch_url` tool (arbitrary URLs) |

Pointing the Ollama base URL somewhere other than `http://localhost:11434` requires adding that origin here **and** reloading the extension — a runtime `baseUrl` without a matching permission entry will fail silently.

## Setup

### Ollama

Ollama is the only backend. Worth stating explicitly when the user reports "nothing happens":

1. `ollama serve` running, with at least one model pulled (default in `storage.ts` is `llama3.2`).
2. `OLLAMA_ORIGINS=chrome-extension://*` in the environment Ollama runs under — otherwise the preflight/origin check rejects the extension's requests. On macOS this is `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart the Ollama app.

3. The model name in Settings must match `ollama list` exactly (tag included, e.g. `qwen3:8b`). Nothing validates it on entry — hitting **Test** next to the model is what surfaces `model "…" not found`.

### Brave web search tool

The `web_search` tool requires a Brave Search API key. Enter it in Settings → Search. Without it, `web_search` calls return an error and the LLM falls back to reasoning without search results. The other tools (`wikipedia`, `news_feed`, `fetch_url`) work without any key.

## Conventions

- Strict TS everywhere. No `any`; prefer discriminated unions (see `MessageResponse`).
- Don't add dependencies for trivial utilities — keep bundle size and attack surface down. The sidepanel is Svelte 5 + shadcn-svelte; reach for an existing `components/ui/` primitive before adding a library.
- The content script runs on every URL the user visits. Keep it cheap and side-effect-free until the user clicks the button. Do not read page text, storage, or the profile on load.
- **SOLID — single responsibility always.** Each module must have one reason to change. When a new concern is introduced, extract it to its own file rather than adding it to an existing one. The pattern is thin orchestrators (`background.ts`, `sidepanel/main.ts`) importing from focused `lib/` modules (`chat-runner.ts`, `agent-runner.ts`, `field-normalizer.ts`). If a file exceeds ~150 lines and mixes concerns, split it before adding more.
- **File names must describe what the module does, not when it was created.** No sprint numbers, ticket IDs, or sequence suffixes in file names (e.g. `chat-runner.ts`, not `background-sprint4.ts`). Test files mirror the module they test: `chat-runner.spec.ts` tests `chat-runner.ts`.
