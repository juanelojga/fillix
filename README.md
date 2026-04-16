# Fillix

A Manifest V3 Chrome extension that puts a local LLM chat in your browser's side panel — no cloud, no telemetry, every token stays on your machine.

Powered by [Ollama](https://ollama.com) running locally.

---

## What it does

Click the Fillix toolbar icon to open a side panel with a streaming chat interface. Ask questions, get markdown-rendered answers, interrupt mid-stream, or wipe the conversation and start fresh — all without leaving your current tab.

Configuration (base URL, model, system prompt) lives in a settings view inside the panel. Changes take effect on the next message without reloading the extension.

---

## Requirements

- Chrome (MV3 side panel support — Chrome 114+)
- [Ollama](https://ollama.com) running locally with at least one model pulled
- `OLLAMA_ORIGINS=chrome-extension://*` set in the environment Ollama runs under

### Setting `OLLAMA_ORIGINS`

The extension makes requests from a `chrome-extension://` origin. Ollama rejects these by default.

**macOS (Ollama.app)**

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
# then restart Ollama from the menu bar
```

**Linux / systemd**

```sh
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://*"
```

Then `sudo systemctl daemon-reload && sudo systemctl restart ollama`.

**Windows**

Set `OLLAMA_ORIGINS=chrome-extension://*` as a user environment variable and restart Ollama.

---

## Development

```sh
pnpm install
pnpm dev
```

1. Open `chrome://extensions`, enable Developer mode.
2. Click "Load unpacked" and select the `dist/` folder.
3. Vite HMR will hot-reload most changes; background script changes require manually clicking the refresh icon on the extensions page.

### Other commands

| Command          | What it does                             |
| ---------------- | ---------------------------------------- |
| `pnpm build`     | Typecheck + production bundle in `dist/` |
| `pnpm typecheck` | `tsc --noEmit`                           |
| `pnpm lint`      | ESLint                                   |
| `pnpm format`    | Prettier                                 |

---

## Architecture

Three extension contexts communicate via `chrome.runtime.sendMessage`:

```
side-panel (chat UI) ──┐                        ┌── Ollama HTTP API
                        ├──▶ background.ts ─────▶│   (localhost:11434)
popup (config/toolbar) ─┘      (service worker)  └──
```

- **`src/background.ts`** — service worker, the only context that calls Ollama. Routes requests through here so the origin is always `chrome-extension://<id>`, not the current page's origin.
- **`src/lib/ollama.ts`** — thin Ollama client (`/api/tags`, `/api/generate`). Streaming responses are forwarded token-by-token back to the panel.
- **`src/lib/storage.ts`** — typed wrapper over `chrome.storage.local` for connection settings and system prompt.
- **`src/types.ts`** — cross-context message contract. Update `Message` and `MessageResponse` here when adding new message kinds.

Build tooling: Vite + [`@crxjs/vite-plugin`](https://crxjs.dev) — handles manifest wiring and HMR for all contexts.

---

## Privacy

Fillix makes no external network requests. All inference runs against your local Ollama instance over loopback. The only outbound connections are to whatever `baseUrl` you configure (default: `http://localhost:11434`).
