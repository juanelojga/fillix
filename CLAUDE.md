# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fillix is a Manifest V3 Chrome extension that auto-fills web forms using a **local Ollama model**. All inference stays on the user's machine — there are no remote API calls. This privacy model is load-bearing; don't introduce cloud-LLM fallbacks or telemetry without explicit direction.

## Commands

- `pnpm install` — install deps
- `pnpm dev` — Vite dev server with HMR. Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on).
- `pnpm build` — typecheck + produce a production bundle in `dist/`
- `pnpm typecheck` — `tsc --noEmit`

There is no test runner yet. If you add one, update this file.

## Architecture

Three extension contexts communicate via `chrome.runtime.sendMessage`:

```
 content.ts (every page)  ──┐                        ┌── Ollama HTTP API
                            ├──▶ background.ts ─────▶│   (localhost:11434)
 popup/main.ts (toolbar) ───┘      (service worker)  └──
```

- **`src/content.ts`** — injected into every page at `document_idle`. Runs `detectFields()` and, if any are found, adds a fixed-position "Fillix: fill" button. Clicking it sends one `OLLAMA_INFER` message per field; fields are filled in-place via `setFieldValue` (dispatches `input`/`change` events so React/Vue form state updates).
- **`src/background.ts`** — service worker. The **only** context that should call the Ollama HTTP API. Content scripts run in the page origin, so their `fetch` to `localhost:11434` would trip Ollama's `OLLAMA_ORIGINS` check with the page's origin. Routing through the background gives a stable `chrome-extension://<id>` origin.
- **`src/popup/`** — toolbar popup for editing the user profile and picking the Ollama base URL + model. Model list is fetched via `OLLAMA_LIST_MODELS` (also through the background).

Shared code lives in `src/lib/`:
- `ollama.ts` — thin client for `/api/tags` and `/api/generate`. Prompts use `format: 'json'` and expect `{"value": "..."}` back; if parse fails, the field is skipped (empty string), **never** hallucinated text.
- `forms.ts` — DOM detection + value setting. `FILLABLE_INPUT_TYPES` is an explicit allowlist (text-like types only). We skip `password`, `file`, `hidden`, `checkbox`, `radio`, `submit` etc. on purpose. Label resolution walks: `<label for>` → wrapping `<label>` → `aria-label` → `aria-labelledby`.
- `storage.ts` — typed wrapper over `chrome.storage.local` for `profile` and `ollama` keys.

`src/types.ts` is the cross-context message contract. When adding a new message kind, update `Message` **and** `MessageResponse`, and add a `case` in `background.ts`'s `handle` — TypeScript's exhaustiveness check will flag the rest.

## Build tooling

`@crxjs/vite-plugin` reads `manifest.config.ts` (typed via `defineManifest`) and wires HMR for all extension contexts. To add a script/page (e.g. options page), add it to `manifest.config.ts`; crxjs handles the Vite input entries automatically.

`host_permissions` currently only allows `http://localhost:11434/*`. If a user points their Ollama at a different host/port, that URL must be added here **and** the extension reloaded — runtime `baseUrl` changes without a matching `host_permissions` entry will fail silently.

## Ollama setup the user needs

The extension won't work until the user has Ollama configured to accept requests from the extension. Worth stating explicitly when the user reports "nothing happens":

1. `ollama serve` running, with at least one model pulled (default in `storage.ts` is `llama3.2`).
2. `OLLAMA_ORIGINS=chrome-extension://*` in the environment Ollama runs under — otherwise the preflight/origin check rejects the extension's requests. On macOS this is `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart the Ollama app.

## Conventions

- Strict TS everywhere. No `any`; prefer discriminated unions (see `MessageResponse`).
- Don't add dependencies for trivial utilities — the popup uses vanilla DOM on purpose to keep bundle size and attack surface down.
- The content script runs on every URL the user visits. Keep it cheap and side-effect-free until the user clicks the button. Do not read page text, storage, or the profile on load.
