# PRD: Multi-Provider Config Persistence & Model Favorites

## 1. Executive Summary

**Problem Statement**: When a user switches the active provider in Settings (e.g., from OpenAI back to Ollama), all previously entered configuration for that provider — base URL, API key, and selected model — is permanently discarded and replaced with hardcoded defaults.

**Proposed Solution**: Store each provider's configuration independently so switching between providers is non-destructive. Add a provider summary in Settings and a compact favorites-based model picker in the Chat and Workflow tabs for fast in-context switching.

**Success Criteria**:

- Switching from Provider A → B → A restores Provider A's config (baseUrl, apiKey, model) exactly as last saved, 100% of the time.
- Settings displays a summary row for every provider that has been configured at least once.
- A user can change the active model from the Chat or Workflow tab in ≤2 clicks without navigating to Settings.
- Favorites can be pinned/unpinned from the Settings model list with a single click.
- Zero regressions in chat streaming, workflow pipeline, or the existing Settings save flow.

---

## 2. User Experience & Functionality

### User Personas

- **Power user** — runs Ollama locally for private tasks but switches to OpenAI or OpenRouter for heavier requests. Maintains separate API keys and model preferences per provider.
- **Experimenter** — tries different models within the same provider frequently and wants to bookmark a short list of go-to models without going through Settings each time.

### User Stories & Acceptance Criteria

**Story 1 — Per-provider config persistence**

> As a power user, I want switching providers in Settings to preserve each provider's previous configuration, so I don't have to re-enter credentials and URLs every time.

- Switching the provider dropdown populates the form with that provider's last-saved values (baseUrl, apiKey, model).
- Switching to a provider that has never been configured populates the form with its hardcoded defaults.
- No config is written to storage until the user clicks **Save Settings**.
- After Save, the previously-active provider's config is also persisted (not just the new one).

**Story 2 — Provider summary**

> As a power user, I want to see a summary of all providers I've configured at a glance in Settings, so I know which ones are ready to use.

- Settings shows a compact summary section listing each provider that has at least one saved value (any non-default field set).
- Each row shows: provider name, base URL (truncated), and a masked API key indicator (e.g., `sk-••••ab12`) if one exists.
- Clicking a row activates that provider in the form (same as changing the dropdown).

**Story 3 — Pin favorite models**

> As a power user, I want to pin models as favorites per provider in Settings, so I have a curated short list available in the Chat and Workflow tabs.

- The model list in Settings has a pin icon next to each model.
- Clicking pin toggles the model in/out of the favorites list for that provider (persists immediately, no Save required).
- Pinned models are visually distinguished in the list (e.g., filled pin icon, sorted to top).
- Favorites are stored independently from the active provider config.

**Story 4 — Model picker in Chat tab**

> As a power user, I want to select from my favorite models directly in the Chat tab header, so I can switch models mid-session without going to Settings.

- A compact picker in the Chat tab header shows the currently active model name and provider.
- Clicking it opens a dropdown listing: all favorites for the active provider, then a separator, then the currently active model if it is not already in favorites.
- Selecting a model updates `providerConfig` in storage immediately (no Save button).
- If the active provider has no favorites, the picker shows only the current model with a hint to pin models in Settings.

**Story 5 — Model picker in Workflow tab**

> As a power user, I want the same model picker available in the Workflow tab, so the pipeline uses whichever model I select there.

- Same component and behavior as Story 4, rendered in the Workflow tab header.
- The selected model is respected by the agent pipeline on the next run.

### Non-Goals

- Per-tab model overrides with separate storage (both tabs share the global `providerConfig`).
- Switching the active **provider type** from the Chat or Workflow tab (only model within the current provider).
- Automatic credential validation or connectivity test on provider switch.
- Provider import/export or backup.
- Syncing configuration across devices via `chrome.storage.sync`.

---

## 3. Technical Specifications

### Architecture Overview

```
chrome.storage.local
  provider          → ProviderConfig          (active config, unchanged)
  providerConfigs   → ProviderConfigs         (NEW: per-provider map)
  favoriteModels    → FavoriteModels          (exists; now exposed in UI)
```

**`ProviderConfigs`** type: `Partial<Record<ProviderType, ProviderConfig>>`

Data flow on provider switch in Settings:

1. User changes dropdown → JS reads `$providerConfigs[newProvider]` from the in-memory Svelte store → populates form fields (no storage write).
2. User clicks **Save** → writes `provider` (active) + `providerConfigs` (full map, updated for current provider) to storage in one `Promise.all`.

Data flow for model picker:

1. Component reads `$providerConfig` (active) + `$favoriteModels[activeProvider]` from stores.
2. User selects a model → calls `setProviderConfig({ ...active, model: selected })` + updates the `providerConfig` store in-memory → no page reload or Save required.

### Storage Changes

| Key               | Type                                            | Change                                     |
| ----------------- | ----------------------------------------------- | ------------------------------------------ |
| `provider`        | `ProviderConfig`                                | Unchanged — still the single active config |
| `providerConfigs` | `Partial<Record<ProviderType, ProviderConfig>>` | **New** — per-provider persistence map     |
| `favoriteModels`  | `Partial<Record<ProviderType, string[]>>`       | Exists — now wired to pin UI in Settings   |

### New / Modified Modules

| File                                          | Change                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/storage.ts`                          | Add `ProviderConfigs` type, `getProviderConfigs()`, `setProviderConfigs()`                                     |
| `src/sidepanel/stores/settings.ts`            | Add `providerConfigs` store; update `loadSettings` (seed on first run) and `saveSettings` (write map)          |
| `src/sidepanel/tabs/SettingsTab.svelte`       | Fix `handleProviderChange` to restore saved config; add provider summary section; add pin toggle to model list |
| `src/sidepanel/components/ModelPicker.svelte` | **New** — compact favorites dropdown; shared by Chat and Workflow tabs                                         |
| `src/sidepanel/tabs/ChatTab.svelte`           | Mount `<ModelPicker>` in header                                                                                |
| `src/sidepanel/tabs/WorkflowTab.svelte`       | Mount `<ModelPicker>` in header                                                                                |

No changes to `src/types.ts`, `src/background.ts`, `src/lib/chat-runner.ts`, `src/lib/agent-runner.ts`, or any provider implementation.

### Security & Privacy

- API keys are stored in `chrome.storage.local` (device-local, not synced). This is the existing behavior — no regression.
- The provider summary must never render an API key in plaintext; mask as `sk-••••{last4}`.
- `ModelPicker` must not trigger a storage write on open — only on selection.

---

## 4. Risks & Roadmap

### Phased Rollout

**MVP** — Config persistence + provider summary

- `providerConfigs` storage key and functions.
- `handleProviderChange` restores saved config in `SettingsTab`.
- `saveSettings` persists the full map.
- Provider summary section in Settings (read-only rows, clickable).

**v1.1** — Favorites pin UI in Settings

- Pin toggle on each model row in the Settings model list.
- `toggleFavorite` already implemented in `settings.ts` — wire it to the UI.
- Pinned models sorted to top of the list.

**v1.2** — `ModelPicker` component in Chat + Workflow tabs

- New `ModelPicker.svelte` component.
- Mounts in Chat tab header and Workflow tab header.
- Immediate model switch on selection (no Save).

### Technical Risks

| Risk                                                          | Likelihood          | Mitigation                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerConfigs` key absent on first load for existing users | Certain (migration) | Seed map from active `provider` key in `loadSettings` if `providerConfigs` is empty                                                                                                 |
| `ModelPicker` overwrites an unsaved Settings form mid-edit    | Low                 | Picker writes directly to `providerConfig` store and storage; Settings form reads from store on `onMount` only — no conflict                                                        |
| Workflow pipeline ignores the picker selection                | Medium              | Verify `agent-runner.ts` reads `getProviderConfig()` at run-time, not at mount-time; currently it reads `getOllamaConfig()` — this is a pre-existing gap, out of scope for this PRD |
