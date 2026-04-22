# PRD: Svelte + shadcn-svelte Migration for Fillix Sidepanel

**Version**: 1.0  
**Date**: 2026-04-22  
**Author**: Juan Almeida  
**Status**: Draft

---

## 1. Executive Summary

### Problem Statement

The Fillix sidepanel is built with ~2,000 lines of vanilla DOM code across a 859-line `index.html` and 6 TypeScript modules. Imperative DOM mutations, manual event wiring, and inline style strings make the UI hard to extend, impossible to test at the component level, and visually dated.

### Proposed Solution

Migrate the sidepanel to **Svelte 5** with **shadcn-svelte** as the component library and **Tailwind CSS 4** for styling. The `lib/` business logic layer (providers, tools, runners, storage) is untouched — only the presentation layer changes. The result is a modern, reactive UI decomposed into focused `.svelte` components with scoped styles, reactive stores replacing manual DOM sync, and a polished design system.

### Success Criteria

| Metric                               | Target                                             |
| ------------------------------------ | -------------------------------------------------- |
| Visual parity with current sidepanel | 100% of existing interactions preserved            |
| Bundle size delta (gzipped JS)       | ≤ 15 KB increase vs current                        |
| Lighthouse Accessibility score       | ≥ 95 on sidepanel HTML                             |
| TypeScript errors at build time      | 0 (`tsc --noEmit` clean)                           |
| Component test coverage              | ≥ 80% of Svelte components have a `.spec.ts`       |
| Dark mode support                    | Full — all surfaces respect `prefers-color-scheme` |

---

## 2. User Experience & Functionality

### User Persona

**Developer / power user** running LLMs locally. Opens the sidepanel frequently for multi-turn chat and form-fill workflows. Prioritizes density and clarity over decoration; judges quality by whether the UI feels native to the browser and responsive during streaming.

### User Stories & Acceptance Criteria

#### US-01 — Chat Tab

> As a user, I want the Chat tab to stream tokens in real time with visible tool-call and thinking blocks, so I can follow the model's reasoning as it happens.

**Acceptance Criteria:**

- Message bubbles distinguish user (right-aligned, accent background) vs assistant (left-aligned, muted surface) visually
- Streaming assistant messages render token-by-token without layout shifts
- Tool-call blocks show tool name + args in a collapsible `<details>`; result populates on resolution
- Thinking blocks render as a distinct collapsible block, not inline with the response
- Send/Stop button swap state is instant (no perceptible delay)
- Textarea auto-expands up to 6 lines then scrolls; `Enter` sends, `Shift+Enter` inserts newline
- "New conversation" clears messages and resets store state

#### US-02 — Settings Tab

> As a user, I want a settings form that validates inputs and gives clear feedback on save, so I never wonder whether my API key was accepted.

**Acceptance Criteria:**

- Provider dropdown (`ollama` / `openai` / `openrouter` / `custom`) shows/hides `baseUrl` and `apiKey` fields based on selection
- Model search input filters the model list live (debounced 200 ms)
- "Refresh models" triggers a live fetch; a spinner replaces the button icon during fetch
- "Pin model" toggles a favorite; pinned models render at the top of the list
- Save button shows a success badge ("Saved ✓") for 2 s on success, an error message on failure
- Brave Search key field is separate from provider key; both are `type="password"` with a show/hide toggle

#### US-03 — Agent Tab

> As a user, I want to run form-fill workflows and confirm field values before they are applied, so I stay in control of what gets written to the page.

**Acceptance Criteria:**

- Workflow selector lists `.yaml` files from the configured Obsidian folder; Refresh button re-fetches
- Pipeline stage indicator shows 5 stages (Collect → Understand → Plan → Draft → Review) with active/done/idle states
- Confirm table renders each field name + proposed value as an editable cell
- Apply and Cancel buttons are full-width and visually distinct (primary vs ghost)
- Error state shows inline with the stage that failed, not as a global alert

#### US-04 — Dark Mode

> As a user, I want the sidepanel to respect my OS color scheme, so it doesn't blind me at night.

**Acceptance Criteria:**

- All surfaces, text, borders, and inputs respond to `prefers-color-scheme: dark` without a manual toggle
- shadcn-svelte CSS variables drive all colors — no hardcoded hex values in component styles
- Contrast ratio ≥ 4.5:1 on all body text (WCAG AA)

#### US-05 — Obsidian Panel

> As a user, I want to configure and test my Obsidian connection without leaving the settings page, so I can confirm it's working before running agent workflows.

**Acceptance Criteria:**

- Host, port, and API key fields are grouped under an `<Accordion>` or collapsible section
- "Test connection" button is disabled until host + port are non-empty; shows a status badge on result
- "Browse" vault file picker opens an `<input type="text">` with a `<datalist>` populated from vault files

### Non-Goals

- **No redesign of the `lib/` layer** — `chat-runner.ts`, `agent-runner.ts`, `pipeline.ts`, and all provider/tool modules are out of scope.
- **No options page or popup UI** — only the sidepanel at `src/sidepanel/` is migrated.
- **No React** — shadcn-svelte is the chosen component system; React/Next.js patterns do not apply.
- **No custom design tokens beyond shadcn-svelte defaults** — extend the palette only if a clear need arises post-migration.
- **No new AI features** — this is a pure UI migration.

---

## 3. Technical Specifications

### 3.1 Technology Decisions

| Layer             | Current                          | Target                                                               |
| ----------------- | -------------------------------- | -------------------------------------------------------------------- |
| UI framework      | Vanilla DOM                      | **Svelte 5** (runes mode)                                            |
| Component library | None                             | **shadcn-svelte** (latest, Svelte 5-compatible)                      |
| Styling           | Inline `<style>` in `index.html` | **Tailwind CSS 4** + shadcn-svelte CSS variables                     |
| State management  | Imperative DOM mutation          | **Svelte `$state` runes** + writable stores for cross-component data |
| Build             | Vite 5 + @crxjs/vite-plugin      | Same — add `@sveltejs/vite-plugin-svelte`                            |

### 3.2 Component Architecture

```
src/sidepanel/
├── App.svelte                  # Root: tab router, port lifecycle
├── index.html                  # Minimal shell — mounts <App />
├── main.ts                     # Entry: new mount(<App>, …)
│
├── tabs/
│   ├── ChatTab.svelte
│   ├── SettingsTab.svelte
│   └── AgentTab.svelte
│
├── components/
│   ├── MessageBubble.svelte    # Single chat message (user | assistant | error)
│   ├── ToolCallBlock.svelte    # Collapsible tool name + args + result
│   ├── ThinkingBlock.svelte    # Collapsible thinking content
│   ├── PipelineStages.svelte   # 5-step progress indicator (Agent tab)
│   ├── ConfirmTable.svelte     # Editable field-value table (Agent tab)
│   └── ObsidianPanel.svelte    # Connection config sub-panel (Settings tab)
│
└── stores/
    ├── chat.ts                 # messages[], streamingState, abortController
    ├── settings.ts             # providerConfig, searchConfig, modelList
    └── agent.ts                # workflowList, pipelineStage, confirmFields
```

**Routing**: `App.svelte` holds a `$state activeTab: 'chat' | 'settings' | 'agent'` and conditionally renders the three tab components. No router library needed.

**Chrome port bridge**: The background port (`chrome.runtime.connect`) is opened once in `App.svelte`'s `onMount` and passed as a Svelte context. Tab components read from the port via `port.onMessage.addListener`; they write via `port.postMessage`. Store mutations happen inside message handlers, keeping all DOM updates reactive.

### 3.3 Svelte 5 Patterns

- Use **runes** (`$state`, `$derived`, `$effect`) throughout — no legacy `$:` reactive statements.
- Streaming token append: `messages` store holds `Message[]`; the last assistant message is mutated in-place so Svelte's fine-grained reactivity avoids full-list re-renders.
- Markdown rendering: `{@html dompurify.sanitize(marked.parse(content))}` — same logic as today, but scoped to `MessageBubble.svelte`.

### 3.4 shadcn-svelte Components Used

| shadcn component                    | Used in                                        |
| ----------------------------------- | ---------------------------------------------- |
| `Button`                            | All send/stop/save/run actions                 |
| `Tabs` + `TabsList` + `TabsTrigger` | App shell tab navigation                       |
| `Textarea`                          | Chat input                                     |
| `Input`                             | All text/password/URL fields                   |
| `Select`                            | Provider select, model select, workflow select |
| `Badge`                             | Save status, pipeline stage labels             |
| `Accordion`                         | Obsidian config section                        |
| `Separator`                         | Section dividers                               |
| `Tooltip`                           | Icon-only buttons (refresh, pin)               |
| `ScrollArea`                        | Message list (replaces raw overflow-y: auto)   |
| `Table`                             | Agent confirm table                            |

### 3.5 Package Changes

**Add:**

```
svelte@5
@sveltejs/vite-plugin-svelte
tailwindcss@4
@tailwindcss/vite
shadcn-svelte          # CLI adds components to src/lib/components/ui/
bits-ui                # peer dep of shadcn-svelte
clsx
tailwind-merge
```

**Remove nothing from `dependencies`** — `marked`, `dompurify`, `js-yaml` remain.

**Note on @crxjs/vite-plugin compatibility**: The beta (`^2.0.0-beta.25`) must be verified against Svelte 5 + Tailwind 4 Vite plugins. Risk item — see §5.

### 3.6 Integration Points

- **`chrome.runtime.connect`** — unchanged API; bridged in `App.svelte` `onMount`.
- **`chrome.storage.local`** — `src/lib/storage.ts` is unchanged; Settings store calls its typed wrappers.
- **`src/lib/` modules** — zero changes; Svelte components import and call the same functions.
- **`manifest.config.ts`** — no changes unless a new HTML page is added.

### 3.7 Testing Strategy

- **Unit tests**: existing `__tests__/` specs for `lib/` modules are unaffected.
- **Component tests**: add `@testing-library/svelte` + `vitest` browser mode for each Svelte component. Each `*.svelte` file gets a `*.spec.ts` mirroring the current `__tests__/` pattern.
- **Smoke test**: `pnpm build` must complete with zero TypeScript errors and zero Vite warnings about unresolved imports.

### 3.8 Security & Privacy

- **No new network access** — Tailwind CSS 4 is fully build-time; no CDN fetches.
- **shadcn-svelte components are inlined** into `src/` by the CLI — no runtime npm imports from shadcn, no CDN dependency.
- **`{@html}` usage** remains gated behind `dompurify.sanitize()` exactly as today.
- **No new `host_permissions`** required.

---

## 4. Risks & Roadmap

### 4.1 Technical Risks

| Risk                                                                                          | Likelihood    | Impact                | Mitigation                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@crxjs/vite-plugin` beta breaks with `@sveltejs/vite-plugin-svelte` + Tailwind 4 Vite plugin | Medium        | High — blocks Phase 1 | Spike in a throwaway branch before committing; fall back to Tailwind PostCSS if Vite plugin conflicts       |
| Svelte 5 runes + shadcn-svelte version mismatch                                               | Low           | Medium                | Pin shadcn-svelte to a version that explicitly supports Svelte 5; check release notes before install        |
| Bundle size regression beyond 15 KB gzip target                                               | Low           | Medium                | Measure with `pnpm build --reporter=verbose`; tree-shake shadcn imports (each component is a separate file) |
| Chrome MV3 service worker suspension during streaming                                         | Existing risk | Existing impact       | No change — background port handling is unchanged                                                           |

### 4.2 Phased Rollout

#### Phase 1 — Foundation + Chat Tab (MVP)

**Goal**: Svelte renders the chat experience end-to-end; other tabs are stubbed.

Tasks:

1. Add `svelte`, `@sveltejs/vite-plugin-svelte`, `tailwindcss@4`, `@tailwindcss/vite` to dev deps
2. Run `shadcn-svelte init`; commit generated `components.json` and `src/lib/components/ui/`
3. Replace `index.html` shell with minimal Svelte mount point
4. Implement `App.svelte` with `<Tabs>` navigation (Chat active, Settings/Agent stubbed)
5. Implement `stores/chat.ts` — messages store + streaming state
6. Implement `ChatTab.svelte`, `MessageBubble.svelte`, `ToolCallBlock.svelte`, `ThinkingBlock.svelte`
7. Wire port bridge: open `chat` port in `App.svelte`, dispatch to chat store
8. Delete `src/sidepanel/main.ts` DOM wiring for chat; delete chat sections from `index.html`
9. Verify streaming, tool calls, thinking blocks, new conversation

**Exit criteria**: `pnpm dev` loads the extension; Chat tab is fully functional and visually upgraded.

#### Phase 2 — Settings + Agent Tabs

**Goal**: Full migration complete; `index.html` is a minimal shell; all vanilla TS deleted.

Tasks:

1. Implement `stores/settings.ts` — provider config, model list
2. Implement `SettingsTab.svelte` + `ObsidianPanel.svelte`
3. Implement `stores/agent.ts` — workflow list, pipeline state, confirm fields
4. Implement `AgentTab.svelte`, `PipelineStages.svelte`, `ConfirmTable.svelte`
5. Wire agent port bridge
6. Delete remaining vanilla DOM code: `settings.ts`, `agent.ts`, `obsidian-panel.ts`, `chat-tools.ts`
7. Reduce `index.html` to `<div id="app"></div>` + script tag
8. Add `@testing-library/svelte`; write component specs for all 8 Svelte components

**Exit criteria**: All three tabs functional; zero vanilla DOM mutation code remaining; `pnpm test` green.

#### Phase 3 — Polish & Accessibility

**Goal**: Dark mode, accessibility audit, micro-interactions.

Tasks:

1. Verify `prefers-color-scheme: dark` across all surfaces using shadcn-svelte CSS vars
2. Run Lighthouse accessibility audit; fix any contrast or ARIA violations
3. Add `Tooltip` to icon-only buttons (Refresh, Pin)
4. Add enter/exit transitions on message bubbles (`transition:fly`)
5. Add `ScrollArea` to message list with smooth anchor-to-bottom behavior
6. Final bundle size check against 15 KB gzip target

**Exit criteria**: Lighthouse Accessibility ≥ 95; dark mode verified in browser; bundle target met.
