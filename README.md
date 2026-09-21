# Fillix

A Manifest V3 Chrome extension that puts an LLM chat in your browser's side panel. Inference runs locally via [Ollama](https://ollama.com) — nothing is sent to a remote model provider, and there is no telemetry. Web search is an opt-in extra: paste a [Tavily](https://tavily.com) key in Settings and the model can search the live web; leave it blank and it cannot.

---

## What it does

Click the Fillix toolbar icon to open a side panel with a streaming chat interface. Ask questions, get markdown-rendered answers, interrupt mid-stream, or wipe the conversation and start fresh — all without leaving your current tab.

A **News** tab sits beside it: press Refresh for 6 headlines across AI, Technology, Software development and Curiosities, then expand any one to have your local model fetch and summarize it. Refreshing costs no tokens — the model only runs on the story you open, and its summary is cached.

The model can call internet tools mid-conversation — Wikipedia lookups, Hacker News headlines, arbitrary URL fetching, and live web search once you have added a Tavily key. The first three need no key of any kind. Each tool call shows an inline indicator you can expand to see the raw result before the model continues.

Configuration lives in a settings view inside the panel: set the Ollama base URL, maintain your own list of model names and pick the active one, and paste a Tavily key to switch web search on. Each has a **Test** button that says what actually went wrong rather than showing a red dot. Changes take effect on the next message without reloading the extension.

---

## Internet tools — prompt examples

The model decides whether to call an internet tool based on how you phrase your message. There is no toggle — phrasing is the control.

### Prompts that trigger a tool call

| What you want             | Example prompt                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| Live web search           | `Search the web for what changed in the EU AI Act this month.`    |
| Current news              | `What's the latest news about the EU AI Act?`                     |
| Wikipedia summary         | `Give me a Wikipedia summary of the Byzantine Empire.`            |
| Fetch a URL               | `Fetch https://example.com/changelog and summarize what changed.` |
| Recent prices / live data | `What is the current price of Brent crude oil?`                   |

The model emits a tool call JSON line, the background fetches the result, and the model continues with that context.

The first two rows want `tavily_search`, which only exists once a Tavily key is saved — without one the model is never told it is there, so it falls back to Hacker News or answers from training data instead of claiming a search it could not run.

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

### Turning on web search (optional)

Everything else works without this. To let the model search the live web:

1. Create a key at [tavily.com](https://tavily.com) — the free tier includes a monthly credit allowance.
2. Open the side panel → **Settings** → **Web search**, paste the key (it starts with `tvly-`), press **Test**.

**Test** asks Tavily about the key rather than running a search, so it costs no credits and tells you how many are left. A search costs one credit, and the model decides when to search — a single reply can search more than once, so the figure is worth glancing at. **Remove key** turns the tool off again, at which point the model stops being told it exists.

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
 sidepanel/main.ts (toolbar) ─┘      (service worker)  └── internet tools (tavily, wiki…)
   (port 'chat')
```

- **`src/background.ts`** — service worker, the only context that makes outbound HTTP requests. Routes both LLM calls and tool fetches through here so the origin is always `chrome-extension://<id>`. Handles streaming via the named `'chat'` port (ReAct chat).
- **`src/lib/ollama.ts`** — the only LLM client: streaming chat, structured generation, and a `testModel()` probe used by the Settings **Test** button.
- **`src/lib/tools/`** — tool implementations: `tavily_search`, `wikipedia`, `news_feed`, `fetch_url`, plus `profile_search` and `meeting_availability`, which never leave the machine. `tool-prompt.ts` builds the menu the model is shown, per turn, so a tool with no key is not advertised.
- **`src/lib/tavily/`** — the web search client, its argument validation, its result formatting and its failure diagnostics. The Settings **Test** button probes Tavily's `/usage` endpoint rather than running a throwaway search, so testing a key costs no search credits and reports how much of the allowance is left.
- **`src/lib/chat-runner.ts`** — ReAct loop: streams tokens, detects tool calls, dispatches tools, loops up to 8 times.
- **`src/lib/storage.ts`** — typed wrapper over `chrome.storage.local` for the Ollama config, the manual model list, the system-prompt override and the Tavily key.
- **`src/prompts/system.md`** — the default chat system prompt, bundled into the build with Vite's `?raw`. Editable in Settings, which stores an override; **Reset to default** clears it.
- **`src/types.ts`** — cross-context message contract. Update `Message`, `MessageResponse`, and `PortMessage` here when adding new message kinds.

Build tooling: Vite + [`@crxjs/vite-plugin`](https://crxjs.dev) — handles manifest wiring and HMR for all contexts.

---

## Privacy

**Inference is local.** Every LLM call goes over loopback to Ollama on your own machine — your conversations never reach a third-party model provider, because there isn't one — and there is no telemetry.

**Web search is the one remote service, and it is opt-in.** `tavily_search` sends the search query the model composed to `api.tavily.com`, and only once you have pasted a Tavily API key in Settings. With no key stored the tool is not even named in the system prompt, so the model has no way to call it. The key lives in `chrome.storage.local` and goes nowhere but Tavily. What leaves your machine is the query text — not your conversation, and not your CV: the system prompt directs anything about your own experience, documents or schedule to `profile_search` and `meeting_availability`, which read local storage and make no request at all. Every search appears in the panel as an expandable row showing the exact query, and clearing the key turns the tool off again.

That last part is worth stating precisely: "don't send my details to a search engine" is an instruction in the prompt, not something the code can enforce. If you paste a job description into chat and ask the model to search for it, it will. What the code does guarantee is that the tool is off until you add a key, that the query is visible before the model continues, and that the profile tools never make a network request.

**The other internet tools need no key.** `wikipedia`, `news_feed` and `fetch_url` make outbound requests only when the LLM explicitly calls them during a conversation. The `<all_urls>` manifest permission required by `fetch_url` is never exercised automatically on page load or in the background.
