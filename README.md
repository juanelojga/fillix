# Fillix

A Manifest V3 Chrome extension that puts an LLM chat in your browser's side panel. Runs fully local via [Ollama](https://ollama.com) — nothing is sent to a remote inference provider, and there is no telemetry.

---

## What it does

Click the Fillix toolbar icon to open a side panel with a streaming chat interface. Ask questions, get markdown-rendered answers, interrupt mid-stream, or wipe the conversation and start fresh — all without leaving your current tab.

The model can call internet tools mid-conversation — Wikipedia lookups, Google News headlines, and arbitrary URL fetching. Each tool call shows an inline indicator you can expand to see the raw result before the model continues.

Configuration lives in a settings view inside the panel: set the Ollama base URL, maintain your own list of model names, and pick the active one. Changes take effect on the next message without reloading the extension.

---

## Internet tools — prompt examples

The model decides whether to call an internet tool based on how you phrase your message. There is no toggle — phrasing is the control.

### Prompts that trigger a tool call

| What you want             | Example prompt                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| Current news              | `What's the latest news about the EU AI Act?`                     |
| Wikipedia summary         | `Give me a Wikipedia summary of the Byzantine Empire.`            |
| Fetch a URL               | `Fetch https://example.com/changelog and summarize what changed.` |
| Recent prices / live data | `What is the current price of Brent crude oil?`                   |

The model emits a tool call JSON line, the background fetches the result, and the model continues with that context.

### Prompts that skip tool calls

| What you want                | Example prompt                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| Reasoning from training data | `Explain how HTTPS works. No need to search anything.`         |
| Code help                    | `Refactor this TypeScript function to use async/await.`        |
| Summarize text you paste     | `Summarize the following article: <paste text here>`           |
| Conceptual questions         | `What are the tradeoffs between REST and GraphQL?`             |
| Explicit opt-out             | `Without searching the internet, explain what WebSockets are.` |

If the model already has enough context to answer — or if you explicitly say not to search — it will reply in plain prose and no tool is dispatched.

---

## Requirements

- Chrome (MV3 side panel support — Chrome 114+)
- [Ollama](https://ollama.com) running locally with at least one model pulled + `OLLAMA_ORIGINS` configured (see below)

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
| `pnpm test`      | Run tests with vitest                    |
| `pnpm lint`      | ESLint                                   |
| `pnpm format`    | Prettier                                 |

---

## Architecture

```
 content.ts (every page)    ──┐                        ┌── Ollama (localhost:11434)
                              ├──▶ background.ts ─────▶│
 sidepanel/main.ts (toolbar) ─┘      (service worker)  └── internet tools (search, wiki…)
   (port 'chat' | 'agent')
```

- **`src/background.ts`** — service worker, the only context that makes outbound HTTP requests. Routes both LLM calls and tool fetches through here so the origin is always `chrome-extension://<id>`. Handles streaming via named ports (`'chat'` for ReAct chat, `'agent'` for form-fill pipeline).
- **`src/lib/ollama.ts`** — the only LLM client: streaming chat, structured generation, and a `testModel()` probe used by the Settings **Test** button.
- **`src/lib/tools/`** — internet tool implementations: `wikipedia`, `news_feed`, `fetch_url`.
- **`src/lib/chat-runner.ts`** — ReAct loop: streams tokens, detects tool calls, dispatches tools, loops up to 8 times.
- **`src/lib/storage.ts`** — typed wrapper over `chrome.storage.local` for the Ollama config, the manual model list, and profile.
- **`src/types.ts`** — cross-context message contract. Update `Message`, `MessageResponse`, and `PortMessage` here when adding new message kinds.

Build tooling: Vite + [`@crxjs/vite-plugin`](https://crxjs.dev) — handles manifest wiring and HMR for all contexts.

---

## Privacy

Fillix is local-only. All inference runs on your machine over loopback to Ollama — your conversations never reach a third-party LLM provider, because there isn't one.

Internet tools (`wikipedia`, `news_feed`, `fetch_url`) make outbound requests only when the LLM explicitly calls them during a conversation. The `<all_urls>` manifest permission required by `fetch_url` is never exercised automatically on page load or in the background.
