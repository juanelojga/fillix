# Plan: Multi-Provider Config Persistence & Model Favorites

**Generated**: 2026-04-24
**Estimated Complexity**: Medium
**PRD**: [multi-provider-config-persistence.md](./multi-provider-config-persistence.md)

## Overview

Three storage/state changes and three UI additions, delivered in four sprints that each leave the extension in a working state:

1. **Sprint 1** — Add the `providerConfigs` storage key and wire it into the settings store (foundation; nothing visible yet).
2. **Sprint 2** — Fix `handleProviderChange` to restore saved config and add the provider summary section in Settings.
3. **Sprint 3** — Add the pin-favorite toggle to the Settings model list.
4. **Sprint 4** — Build the `ModelPicker` component and mount it in Chat and Workflow tab headers.

No changes to `src/types.ts`, `src/background.ts`, any provider implementation, or any runner.

---

## Prerequisites

- `pnpm install` already run
- Extension loads in Chrome with `pnpm dev` + unpacked from `dist/`
- At least one non-Ollama provider configured to verify round-trip persistence

---

## Sprint 1: Storage & Store Foundation

**Goal**: `providerConfigs` can be read and written to `chrome.storage.local`; the settings store loads and saves the full per-provider map; existing behavior is unchanged for users with no `providerConfigs` key yet.

**Demo/Validation**:

- Open DevTools → Application → Storage → `chrome.storage.local`; after opening Settings and clicking Save, confirm `providerConfigs` key appears with the correct shape.
- Run `pnpm test` — all existing tests pass; new storage tests pass.

### Task 1.1: Add `ProviderConfigs` type and storage functions

- **Location**: `src/lib/storage.ts`
- **Description**: Add a `ProviderConfigs` type alias and two async helpers.

  ```typescript
  export type ProviderConfigs = Partial<Record<ProviderType, ProviderConfig>>;

  export async function getProviderConfigs(): Promise<ProviderConfigs> {
    const { providerConfigs } = await chrome.storage.local.get('providerConfigs');
    return (providerConfigs as ProviderConfigs | undefined) ?? {};
  }

  export async function setProviderConfigs(configs: ProviderConfigs): Promise<void> {
    await chrome.storage.local.set({ providerConfigs: configs });
  }
  ```

- **Dependencies**: None
- **Acceptance Criteria**:
  - `getProviderConfigs()` returns `{}` when key is absent (new install).
  - `setProviderConfigs(map)` persists the map; a subsequent `getProviderConfigs()` returns the same map.
- **Validation**: Unit tests in Task 1.2.

### Task 1.2: Unit tests for `getProviderConfigs` / `setProviderConfigs`

- **Location**: `src/lib/storage.spec.ts`
- **Description**: Add test cases using the existing `chrome.storage.local` mock pattern already in the file.
  - `getProviderConfigs()` → returns `{}` when key missing.
  - `getProviderConfigs()` → returns stored map when key present.
  - `setProviderConfigs(map)` → persists and `getProviderConfigs()` round-trips it.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**: `pnpm test` green with new cases.

### Task 1.3: Add `providerConfigs` store and update `loadSettings` / `saveSettings`

- **Location**: `src/sidepanel/stores/settings.ts`
- **Description**:
  1. Import `getProviderConfigs`, `setProviderConfigs`, `ProviderConfigs` from `../../lib/storage`.
  2. Export a new store: `export const providerConfigs = writable<ProviderConfigs>({});`
  3. In `loadSettings`: load `providerConfigs` from storage alongside the existing three keys. If the result is empty (new install or existing user), seed it with `{ [activeProvider.provider]: activeProvider }` so the active config is not lost.
  4. In `saveSettings(newProviderConfig, newSearchConfig)`: before writing, merge `newProviderConfig` into the current in-memory map, then write `providerConfigs` and `provider` atomically in the same `Promise.all`.

  ```typescript
  // loadSettings addition
  const [provider, search, favorites, configs] = await Promise.all([
    getProviderConfig(),
    getSearchConfig(),
    getFavoriteModels(),
    getProviderConfigs(),
  ]);
  const seededConfigs: ProviderConfigs =
    Object.keys(configs).length === 0 ? { [provider.provider]: provider } : configs;
  providerConfigs.set(seededConfigs);

  // saveSettings addition
  const currentConfigs = get(providerConfigs);
  const updatedConfigs: ProviderConfigs = {
    ...currentConfigs,
    [newProviderConfig.provider]: newProviderConfig,
  };
  await Promise.all([
    setProviderConfig(newProviderConfig),
    setSearchConfig(newSearchConfig),
    setProviderConfigs(updatedConfigs),
  ]);
  providerConfigs.set(updatedConfigs);
  ```

- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - After first `loadSettings` on a fresh install, `$providerConfigs` contains the default Ollama entry.
  - After `saveSettings`, `$providerConfigs[provider]` equals the saved config.
  - No existing test breaks.
- **Validation**: `pnpm test`; manual storage inspection in DevTools.

---

## Sprint 2: Settings UI — Provider Switch & Summary

**Goal**: Switching the provider dropdown restores the last-saved config for that provider. A read-only summary section lists all configured providers; clicking a row activates it.

**Demo/Validation**:

- Configure OpenAI with a real API key and model. Switch to Ollama. Switch back to OpenAI — key and model are restored exactly.
- Provider summary shows Ollama and OpenAI rows after both are saved.
- Clicking a summary row activates that provider in the form.

### Task 2.1: Fix `handleProviderChange` to restore saved config

- **Location**: `src/sidepanel/tabs/SettingsTab.svelte`
- **Description**: Replace the hardcoded-defaults block with a lookup in `$providerConfigs`. Before restoring the new provider, flush any unsaved edits from the current form back into the in-memory `providerConfigs` store so they can be restored if the user switches back.

  ```typescript
  import { providerConfig, providerConfigs, ... } from '../stores/settings';
  import { get } from 'svelte/store';

  function handleProviderChange(newProvider: ProviderType) {
    // Stash current unsaved form state so switching back restores it
    const currentSnapshot: ProviderConfig = { provider, baseUrl, model, ...(apiKey ? { apiKey } : {}) };
    providerConfigs.update((map) => ({ ...map, [provider]: currentSnapshot }));

    provider = newProvider;

    const DEFAULTS: Record<ProviderType, ProviderConfig> = {
      ollama:     { provider: 'ollama',     baseUrl: 'http://localhost:11434', model: 'llama3.2' },
      openai:     { provider: 'openai',     baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
      openrouter: { provider: 'openrouter', baseUrl: 'https://openrouter.ai',  model: '' },
      custom:     { provider: 'custom',     baseUrl: '',                       model: '' },
    };

    const saved = get(providerConfigs)[newProvider] ?? DEFAULTS[newProvider];
    baseUrl = saved.baseUrl;
    model   = saved.model;
    apiKey  = saved.apiKey ?? '';

    refreshModels({ provider: newProvider, baseUrl: saved.baseUrl, model: saved.model, ...(saved.apiKey ? { apiKey: saved.apiKey } : {}) });
  }
  ```

- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Switching to a never-configured provider populates hardcoded defaults.
  - Switching to a previously-saved provider populates its last-saved values.
  - Unsaved edits are preserved in memory for the duration of the Settings session.
- **Validation**: Manual round-trip test; `pnpm test` green.

### Task 2.2: Add provider summary section in `SettingsTab.svelte`

- **Location**: `src/sidepanel/tabs/SettingsTab.svelte`
- **Description**: Below the Provider section, add a "Configured providers" read-only summary. Only show providers with at least one non-default value set (i.e., `apiKey` present or `baseUrl` differs from default, or `model` differs from default). Each row shows: provider name, truncated base URL, masked API key. Clicking a row calls `handleProviderChange`.

  ```svelte
  <!-- Provider summary (shown only when ≥1 provider has been configured) -->
  {#if configuredProviders.length > 0}
    <section class="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-violet-500 shrink-0"></div>
        <h2 class="text-sm font-semibold text-slate-800">Configured providers</h2>
      </div>
      {#each configuredProviders as row}
        <button
          class="flex items-center justify-between w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 transition-colors {row.provider === provider ? 'ring-1 ring-indigo-400' : ''}"
          onclick={() => handleProviderChange(row.provider)}
        >
          <span class="font-medium text-slate-700 capitalize">{row.provider}</span>
          <span class="text-muted-foreground truncate max-w-[120px]">{row.baseUrl}</span>
          {#if row.apiKey}
            <span class="text-muted-foreground font-mono">sk-••••{row.apiKey.slice(-4)}</span>
          {/if}
        </button>
      {/each}
    </section>
  {/if}
  ```

  Drive the list with a `$derived`:

  ```typescript
  const DEFAULT_URLS: Record<ProviderType, string> = {
    ollama: 'http://localhost:11434',
    openai: 'https://api.openai.com',
    openrouter: 'https://openrouter.ai',
    custom: '',
  };
  const DEFAULT_MODELS: Record<ProviderType, string> = {
    ollama: 'llama3.2',
    openai: 'gpt-4o-mini',
    openrouter: '',
    custom: '',
  };

  let configuredProviders = $derived(
    Object.values($providerConfigs ?? {}).filter(
      (cfg) =>
        cfg &&
        (cfg.apiKey ||
          cfg.baseUrl !== DEFAULT_URLS[cfg.provider] ||
          cfg.model !== DEFAULT_MODELS[cfg.provider]),
    ) as ProviderConfig[],
  );
  ```

- **Dependencies**: Task 1.3, Task 2.1
- **Acceptance Criteria**:
  - Row appears only after a non-default value has been saved.
  - Active provider row has visible highlight.
  - API key is always masked; never renders in plaintext.
- **Validation**: Manual test; verify the DOM never contains the raw key string.

---

## Sprint 3: Pin Favorites in Settings

**Goal**: Every model in the Settings list has a pin icon; clicking it toggles the model in/out of favorites without requiring Save. Pinned models sort to the top.

**Demo/Validation**:

- Open Settings. Refresh models. Click pin on "gpt-4o". Icon fills. Close and reopen Settings — model is still pinned and at the top.
- `pnpm test` green.

### Task 3.1: Sort pinned models to top in `filterModels`

- **Location**: `src/sidepanel/stores/settings.ts`
- **Description**: Add a `sortWithFavorites` helper. Pinned models appear first (preserving their relative order among themselves), then the rest.

  ```typescript
  export function sortWithFavorites(models: string[], favorites: string[]): string[] {
    const pinned = models.filter((m) => favorites.includes(m));
    const rest = models.filter((m) => !favorites.includes(m));
    return [...pinned, ...rest];
  }
  ```

  This is a pure function — no store side effects.

- **Dependencies**: None (parallel with Task 3.2)
- **Acceptance Criteria**: Unit test: given `['a','b','c']` with favorites `['c']`, returns `['c','a','b']`.
- **Validation**: Unit test in `src/sidepanel/stores/settings.spec.ts` (or existing settings store test file if one exists).

### Task 3.2: Wire pin toggle to model list in `SettingsTab.svelte`

- **Location**: `src/sidepanel/tabs/SettingsTab.svelte`
- **Description**: Import `favoriteModels`, `toggleFavorite`, `sortWithFavorites`. Replace the existing `filteredModels` derived with one that applies `sortWithFavorites`. In the model list, replace `<option>` with a styled `<li>` row containing the model name and a pin `<button>`.

  ```typescript
  import { favoriteModels, toggleFavorite, sortWithFavorites } from '../stores/settings';

  let filteredModels = $derived(
    sortWithFavorites(filterModels(modelQuery, $modelList), $favoriteModels[provider] ?? []),
  );
  ```

  Model list UI change — replace the bare `<select>`:

  ```svelte
  {#if filteredModels.length > 0}
    <ul class="max-h-40 overflow-y-auto rounded-md border border-input bg-background divide-y divide-border">
      {#each filteredModels as m (m)}
        {@const isPinned = ($favoriteModels[provider] ?? []).includes(m)}
        <li
          class="flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer hover:bg-muted {m === model ? 'bg-muted font-medium' : ''}"
          onclick={() => { model = m; }}
          role="option"
          aria-selected={m === model}
        >
          <span class="flex-1 truncate">{m}</span>
          <button
            type="button"
            aria-label="{isPinned ? 'Unpin' : 'Pin'} {m}"
            class="ml-2 text-muted-foreground hover:text-foreground transition-colors"
            onclick={(e) => { e.stopPropagation(); void toggleFavorite(m, provider); }}
          >
            {isPinned ? '📌' : '📍'}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <Input id="model" bind:value={model} placeholder="llama3.2" />
  {/if}
  ```

- **Dependencies**: Task 3.1, Task 1.3
- **Acceptance Criteria**:
  - Pin state reflects `$favoriteModels[provider]` reactively.
  - `toggleFavorite` called immediately; no Save required.
  - Pin button has accessible `aria-label`.
  - Clicking a row (not the pin button) selects the model.
- **Validation**: Manual test; `pnpm test` green.

---

## Sprint 4: ModelPicker Component

**Goal**: Chat and Workflow tab headers each show a compact model picker displaying the active model. Clicking it opens a dropdown with favorites first; selecting a model updates storage immediately.

**Demo/Validation**:

- Open Chat tab. Picker shows active model name.
- Click picker → dropdown shows pinned models first, separator, then current model if not pinned.
- Select a different model → picker label updates; sending a message uses the new model (verify via DevTools network or background log).
- Workflow tab picker behaves identically.
- `pnpm test` green.

### Task 4.1: Create `ModelPicker.svelte`

- **Location**: `src/sidepanel/components/ModelPicker.svelte`
- **Description**: Compact dropdown component. Reads `providerConfig` and `favoriteModels` stores directly. On model selection writes to storage via `setProviderConfig` and updates the store.

  ```svelte
  <script lang="ts">
    import { get } from 'svelte/store';
    import { providerConfig, favoriteModels } from '../stores/settings';
    import { setProviderConfig } from '../../lib/storage';

    let open = $state(false);

    let activeProvider = $derived($providerConfig?.provider ?? 'ollama');
    let activeModel    = $derived($providerConfig?.model ?? '');
    let favorites      = $derived($favoriteModels[activeProvider] ?? []);

    // favorites first, then current model as fallback if not already listed
    let options = $derived(
      favorites.includes(activeModel)
        ? favorites
        : favorites.length > 0 ? [...favorites, null, activeModel] : [activeModel]
      // null = separator sentinel
    );

    async function selectModel(model: string) {
      const cfg = get(providerConfig);
      if (!cfg || model === activeModel) { open = false; return; }
      const updated = { ...cfg, model };
      await setProviderConfig(updated);
      providerConfig.set(updated);
      open = false;
    }
  </script>

  <div class="relative">
    <button
      type="button"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      onclick={() => open = !open}
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <span class="max-w-[120px] truncate">{activeModel || 'No model'}</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>

    {#if open}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md border border-border bg-background shadow-md py-1"
        role="listbox"
        onkeydown={(e) => e.key === 'Escape' && (open = false)}
      >
        {#if favorites.length === 0}
          <p class="px-3 py-2 text-xs text-muted-foreground">Pin models in Settings to see them here.</p>
        {/if}

        {#each options as opt (opt)}
          {#if opt === null}
            <hr class="my-1 border-border" />
          {:else}
            <button
              type="button"
              role="option"
              aria-selected={opt === activeModel}
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors {opt === activeModel ? 'font-medium' : ''}"
              onclick={() => selectModel(opt)}
            >
              {opt}
            </button>
          {/if}
        {/each}
      </div>

      <!-- Click-outside dismiss -->
      <button
        type="button"
        aria-hidden="true"
        class="fixed inset-0 z-40"
        tabindex="-1"
        onclick={() => open = false}
      ></button>
    {/if}
  </div>
  ```

- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Picker does not trigger a storage write on open — only on selection.
  - Shows "Pin models in Settings…" hint when favorites list is empty.
  - Selecting the already-active model closes the dropdown without a storage write.
  - Click-outside closes the dropdown.
- **Validation**: Task 4.4 component test; manual smoke test.

### Task 4.2: Mount `<ModelPicker>` in `ChatTab.svelte`

- **Location**: `src/sidepanel/tabs/ChatTab.svelte`
- **Description**: Import and render `ModelPicker` in the existing header row alongside the "New chat" button. Position it on the left side of the header so it is visually distinct from the "New chat" action.

  ```svelte
  import ModelPicker from '../components/ModelPicker.svelte';

  <!-- Header: model picker + new conversation button -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-border/50">
    <ModelPicker />
    <button ...>New chat</button>
  </div>
  ```

- **Dependencies**: Task 4.1
- **Acceptance Criteria**: Picker renders without breaking existing chat streaming; selecting a model is picked up on the next `CHAT_START` message (`$providerConfig?.model` is already read at send time).
- **Validation**: Manual smoke test — send a message, verify `CHAT_START` carries the updated model.

### Task 4.3: Mount `<ModelPicker>` in `WorkflowTab.svelte`

- **Location**: `src/sidepanel/tabs/WorkflowTab.svelte`
- **Description**: Import and render `ModelPicker` above the workflow selector row.

  ```svelte
  import ModelPicker from '../components/ModelPicker.svelte';

  <!-- Model picker -->
  <div class="flex items-center px-1 pb-1">
    <ModelPicker />
  </div>

  <!-- Existing: Workflow selector + Run + Refresh -->
  <div class="flex gap-2 items-center shrink-0"> ... </div>
  ```

- **Dependencies**: Task 4.1
- **Acceptance Criteria**: Picker renders; does not conflict with `isAgentRunning` disabled state (picker is always interactive; pipeline reads `getProviderConfig()` at run-time from background).
- **Validation**: Manual smoke test — change model, run a workflow, confirm pipeline uses the new model.

### Task 4.4: Component test for `ModelPicker.svelte`

- **Location**: `src/sidepanel/components/ModelPicker.spec.ts`
- **Description**: jsdom Svelte component test (follows existing pattern in `src/sidepanel/components/*.spec.ts`).
  - Renders picker showing active model name.
  - Click opens dropdown; shows favorites list.
  - Selecting a model calls `setProviderConfig` and updates `providerConfig` store.
  - Shows hint text when `favoriteModels` is empty.
  - Escape key closes dropdown.
- **Dependencies**: Task 4.1
- **Validation**: `pnpm test` green.

---

## Testing Strategy

| Sprint | How to verify                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------- |
| 1      | `pnpm test` — new unit tests in `storage.spec.ts`                                               |
| 2      | Manual round-trip (save OpenAI, switch to Ollama, switch back); inspect storage in DevTools     |
| 3      | `pnpm test` — `sortWithFavorites` unit test; manual pin/unpin in Settings                       |
| 4      | `pnpm test` — `ModelPicker.spec.ts`; manual end-to-end (switch model in Chat tab, send message) |

Run `pnpm typecheck` after each sprint to catch any type errors introduced.

---

## Potential Risks & Gotchas

| Risk                                                            | Likelihood         | Mitigation                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerConfigs` absent on first load for existing users       | Certain            | Sprint 1 seeds it from active `provider` key in `loadSettings`                                                                                                                                                  |
| Unsaved form edits lost when switching provider dropdown        | High without fix   | Task 2.1 stashes current form state into in-memory store before restoring the new provider                                                                                                                      |
| `ModelPicker` opens dropdown and triggers storage write on open | Easy mistake       | Task 4.1: `open` flag is local `$state`; `setProviderConfig` only called inside `selectModel`                                                                                                                   |
| `ModelPicker` update not reflected in next `CHAT_START`         | Medium             | `ChatTab` reads `$providerConfig?.model` at send time (line 137); the store update in `selectModel` happens before the next send, so no timing issue                                                            |
| `WorkflowTab` pipeline ignoring picker selection                | Medium             | `agent-runner.ts` calls `getProviderConfig()` at run-time, not mount-time — verify this remains true; noted in PRD as a pre-existing gap for `getOllamaConfig` but not a new regression                         |
| Provider summary row renders raw API key                        | High security risk | Task 2.2 derives display string as `sk-••••{key.slice(-4)}` — never bind the store field directly                                                                                                               |
| `sortWithFavorites` mutates model list order unexpectedly       | Low                | It creates a new array; `filterModels` output is not mutated                                                                                                                                                    |
| `ModelPicker` dropdown stays open after tab switch              | UX issue           | The sidepanel mounts one instance per tab; switching Chrome tabs unmounts/remounts — not an issue. Switching sidepanel tabs could leave it open; adding a `$effect` to close on route change is optional polish |

---

## Rollback Plan

- All changes are additive: the `providerConfigs` key is ignored if absent, and the existing `provider` key is unchanged.
- To revert Sprint 4: remove `<ModelPicker />` from Chat and Workflow tabs; the component file can be deleted.
- To revert Sprint 3: restore the `<select>` for the model list; `toggleFavorite` and `sortWithFavorites` are unused but harmless.
- To revert Sprint 1–2: remove `providerConfigs` store, revert `loadSettings`/`saveSettings` to original, remove `handleProviderChange` fix. The stale `providerConfigs` key in storage is benign.
