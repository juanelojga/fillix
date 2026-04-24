<script lang="ts">
  import { get } from 'svelte/store';
  import { providerConfig, favoriteModels } from '../stores/settings';
  import { setProviderConfig } from '../../lib/storage';

  let open = $state(false);

  let activeProvider = $derived($providerConfig?.provider ?? 'ollama');
  let activeModel = $derived($providerConfig?.model ?? '');
  let favorites = $derived($favoriteModels[activeProvider] ?? []);

  let options = $derived(
    favorites.includes(activeModel)
      ? favorites
      : favorites.length > 0
        ? [...favorites, null, activeModel]
        : [activeModel],
  );

  async function selectModel(model: string) {
    const cfg = get(providerConfig);
    if (!cfg || model === activeModel) {
      open = false;
      return;
    }
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
    onclick={() => (open = !open)}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="max-w-[120px] truncate">{activeModel || 'No model'}</span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md border border-border bg-background shadow-md py-1"
      role="listbox"
      tabindex="0"
      onkeydown={(e) => e.key === 'Escape' && (open = false)}
    >
      {#if favorites.length === 0}
        <p class="px-3 py-2 text-xs text-muted-foreground">
          Pin models in Settings to see them here.
        </p>
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
      onclick={() => (open = false)}
    ></button>
  {/if}
</div>
