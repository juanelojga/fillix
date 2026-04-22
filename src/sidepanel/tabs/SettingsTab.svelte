<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    providerConfig,
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
    provider = newProvider;
    const defaults: Record<ProviderType, { baseUrl: string; model: string }> = {
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
      openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
      openrouter: { baseUrl: 'https://openrouter.ai', model: '' },
      custom: { baseUrl: '', model: '' },
    };
    baseUrl = defaults[newProvider].baseUrl;
    model = defaults[newProvider].model;
    apiKey = '';
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
