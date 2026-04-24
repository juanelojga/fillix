<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    providerConfig,
    providerConfigs,
    searchConfig,
    modelList,
    loadSettings,
    saveSettings,
    refreshModels,
    filterModels,
  } from '../stores/settings';
  import type { ProviderConfig, ProviderType, SearchConfig } from '../../types';
  import { Input } from '$components/ui/input';
  import { Button } from '$components/ui/button';
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
  } from '$components/ui/tooltip';
  import ObsidianPanel from '../components/ObsidianPanel.svelte';

  let provider = $state<ProviderType>('ollama');
  let baseUrl = $state('http://localhost:11434');
  let model = $state('llama3.2');
  let apiKey = $state('');
  let braveApiKey = $state('');
  let modelQuery = $state('');
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');

  let filteredModels = $derived(filterModels(modelQuery, $modelList));

  const PROVIDER_DEFAULTS: Record<ProviderType, ProviderConfig> = {
    ollama:     { provider: 'ollama',     baseUrl: 'http://localhost:11434', model: 'llama3.2' },
    openai:     { provider: 'openai',     baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
    openrouter: { provider: 'openrouter', baseUrl: 'https://openrouter.ai',  model: '' },
    custom:     { provider: 'custom',     baseUrl: '',                       model: '' },
  };

  let configuredProviders = $derived(
    Object.values($providerConfigs ?? {}).filter(
      (cfg): cfg is ProviderConfig =>
        !!cfg &&
        !!(cfg.apiKey ||
          cfg.baseUrl !== PROVIDER_DEFAULTS[cfg.provider].baseUrl ||
          cfg.model !== PROVIDER_DEFAULTS[cfg.provider].model),
    ),
  );

  onMount(async () => {
    await loadSettings();
    const cfg = get(providerConfig);
    if (cfg) {
      provider = cfg.provider;
      baseUrl = cfg.baseUrl;
      model = cfg.model;
      apiKey = cfg.apiKey ?? '';
    }
    const search = get(searchConfig);
    if (search) {
      braveApiKey = search.braveApiKey ?? '';
    }
    const currentConfig = get(providerConfig);
    if (currentConfig) await refreshModels(currentConfig);
  });

  function handleProviderChange(newProvider: ProviderType) {
    // Stash current unsaved form state so switching back can restore it
    const snapshot: ProviderConfig = { provider, baseUrl, model, ...(apiKey ? { apiKey } : {}) };
    providerConfigs.update((map) => ({ ...map, [provider]: snapshot }));

    provider = newProvider;

    const saved = get(providerConfigs)[newProvider] ?? PROVIDER_DEFAULTS[newProvider];
    baseUrl = saved.baseUrl;
    model   = saved.model;
    apiKey  = saved.apiKey ?? '';

    void refreshModels({ provider: newProvider, baseUrl: saved.baseUrl, model: saved.model, ...(saved.apiKey ? { apiKey: saved.apiKey } : {}) });
  }

  function handleRefreshModels() {
    const cfg = get(providerConfig);
    if (cfg) refreshModels(cfg);
  }

  async function handleSave() {
    saveStatus = 'saving';
    const providerCfg: ProviderConfig = {
      provider,
      baseUrl,
      model,
      ...(apiKey ? { apiKey } : {}),
    };
    const searchCfg: SearchConfig = {
      ...(braveApiKey ? { braveApiKey } : {}),
    };
    await saveSettings(providerCfg, searchCfg);
    await refreshModels(providerCfg);
    saveStatus = 'saved';
    setTimeout(() => {
      saveStatus = 'idle';
    }, 2000);
  }
</script>

<TooltipProvider>
  <div class="flex flex-col gap-3 p-4 overflow-y-auto h-full">
  <!-- Provider section -->
  <section class="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
    <div class="flex items-center gap-2">
      <div class="w-1 h-4 rounded-full bg-indigo-500 shrink-0"></div>
      <h2 class="text-sm font-semibold text-slate-800">Provider</h2>
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-xs text-muted-foreground" for="provider-select">Provider type</label>
      <select
        id="provider-select"
        class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={provider}
        onchange={(e) => handleProviderChange((e.currentTarget as HTMLSelectElement).value as ProviderType)}
      >
        <option value="ollama">Ollama (local)</option>
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
        <option value="custom">Custom</option>
      </select>
    </div>

    {#if provider !== 'ollama'}
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground" for="base-url">Base URL</label>
        <Input id="base-url" bind:value={baseUrl} placeholder="https://api.openai.com" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground" for="api-key">API key</label>
        <Input
          id="api-key"
          type="password"
          bind:value={apiKey}
          placeholder="sk-..."
          autocomplete="off"
        />
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <label class="text-xs text-muted-foreground" for="model-query">Model</label>
        <Tooltip>
          <TooltipTrigger
            aria-label="Refresh models"
            class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onclick={handleRefreshModels}
          >
            ↻
          </TooltipTrigger>
          <TooltipContent>Refresh models</TooltipContent>
        </Tooltip>
      </div>
      <Input id="model-query" bind:value={modelQuery} placeholder="Filter models…" />
      {#if filteredModels.length > 0}
        <select
          class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          bind:value={model}
        >
          {#each filteredModels as m (m)}
            <option value={m}>{m}</option>
          {/each}
        </select>
      {:else}
        <Input id="model" bind:value={model} placeholder="llama3.2" />
      {/if}
    </div>
  </section>

  <!-- Configured providers summary -->
  {#if configuredProviders.length > 0}
    <section class="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-violet-500 shrink-0"></div>
        <h2 class="text-sm font-semibold text-slate-800">Configured providers</h2>
      </div>
      {#each configuredProviders as row (row.provider)}
        <button
          class="flex items-center justify-between w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 transition-colors {row.provider === provider ? 'ring-1 ring-indigo-400' : ''}"
          onclick={() => handleProviderChange(row.provider)}
        >
          <span class="font-medium text-slate-700 capitalize">{row.provider}</span>
          <span class="text-muted-foreground truncate max-w-30">{row.baseUrl}</span>
          {#if row.apiKey}
            <span class="text-muted-foreground font-mono">sk-••••{row.apiKey.slice(-4)}</span>
          {/if}
        </button>
      {/each}
    </section>
  {/if}

  <!-- Search section -->
  <section class="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
    <div class="flex items-center gap-2">
      <div class="w-1 h-4 rounded-full bg-sky-500 shrink-0"></div>
      <h2 class="text-sm font-semibold text-slate-800">Search</h2>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-xs text-muted-foreground" for="brave-api-key">Brave Search API key</label>
      <Input
        id="brave-api-key"
        type="password"
        bind:value={braveApiKey}
        placeholder="BSA..."
        autocomplete="off"
      />
      <p class="text-xs text-muted-foreground">
        Required for the web_search tool. Leave blank to disable.
      </p>
    </div>
  </section>

  <!-- Obsidian section -->
  <ObsidianPanel />

  <!-- Save -->
  <Button variant="default" onclick={handleSave} disabled={saveStatus === 'saving'} class="self-end px-6" size="lg">
    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save Settings'}
  </Button>
  </div>
</TooltipProvider>
