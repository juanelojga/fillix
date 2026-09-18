<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    ollamaConfig,
    modelList,
    loadSettings,
    saveSettings,
    addModel,
    removeModel,
    setActiveModel,
    testModel,
    systemPromptOverride,
    saveSystemPrompt,
    resetSystemPrompt,
  } from '../stores/settings';
  import type { OllamaConfig } from '../../types';
  import { Input } from '$components/ui/input';
  import { Textarea } from '$components/ui/textarea';
  import { Button } from '$components/ui/button';
  import { Badge } from '$components/ui/badge';
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
  } from '$components/ui/tooltip';
  import { diagnoseTestFailure } from '../../lib/model-test-diagnostics';
  import { DEFAULT_SYSTEM_PROMPT } from '../../lib/system-prompt';

  type TestState = { status: 'testing' } | { status: 'ok'; latencyMs: number } | { status: 'error'; error: string };

  function formatLatency(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
  }

  let baseUrl = $state('http://localhost:11434');
  let model = $state('');
  let newModel = $state('');
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
  let testStates = $state<Record<string, TestState>>({});
  let promptText = $state('');
  let promptStatus = $state<'idle' | 'saving' | 'saved'>('idle');

  onMount(async () => {
    await loadSettings();
    const cfg = get(ollamaConfig);
    if (cfg) {
      baseUrl = cfg.baseUrl;
      model = cfg.model;
    }
    promptText = get(systemPromptOverride);
  });

  // Keep the radio in sync when the model changes from elsewhere (e.g. chat header).
  $effect(() => {
    const active = $ollamaConfig?.model;
    if (active !== undefined) model = active;
  });

  // Test runs in the service worker, which reads the *saved* config — not whatever is
  // currently typed into the Base URL field. Surface that, or an unsaved edit silently
  // probes the old URL.
  let testedBaseUrl = $derived($ollamaConfig?.baseUrl ?? baseUrl);
  let baseUrlDirty = $derived($ollamaConfig != null && baseUrl !== $ollamaConfig.baseUrl);

  async function handleAdd() {
    await addModel(newModel);
    newModel = '';
  }

  async function handleRemove(name: string) {
    await removeModel(name);
    const { [name]: _removed, ...rest } = testStates;
    testStates = rest;
  }

  async function handleTest(name: string) {
    testStates = { ...testStates, [name]: { status: 'testing' } };
    const result = await testModel(name);
    testStates = {
      ...testStates,
      [name]: result.ok
        ? { status: 'ok', latencyMs: result.latencyMs }
        : { status: 'error', error: result.error },
    };
  }

  async function handleSavePrompt() {
    promptStatus = 'saving';
    await saveSystemPrompt(promptText);
    promptText = get(systemPromptOverride);
    promptStatus = 'saved';
    setTimeout(() => {
      promptStatus = 'idle';
    }, 2000);
  }

  async function handleResetPrompt() {
    await resetSystemPrompt();
    promptText = '';
  }

  async function handleSave() {
    saveStatus = 'saving';
    const ollamaCfg: OllamaConfig = { baseUrl, model };
    await saveSettings(ollamaCfg);
    saveStatus = 'saved';
    setTimeout(() => {
      saveStatus = 'idle';
    }, 2000);
  }
</script>

<TooltipProvider>
  <div class="flex flex-col gap-3 p-4 overflow-y-auto h-full">
    <!-- Ollama section -->
    <section class="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-indigo-500 shrink-0"></div>
        <h2 class="text-sm font-semibold text-slate-800">Ollama</h2>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground" for="base-url">Base URL</label>
        <Input id="base-url" bind:value={baseUrl} placeholder="http://localhost:11434" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground" for="new-model">Models</label>
        <div class="flex gap-2">
          <Input
            id="new-model"
            bind:value={newModel}
            placeholder="gemma4:12b"
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button variant="secondary" onclick={handleAdd} disabled={!newModel.trim()}>+ Add</Button>
        </div>
        <p class="text-xs text-muted-foreground">
          Type the model name exactly as <code>ollama list</code> shows it. Names aren't checked until you
          Test — <strong>Test</strong> sends one short prompt to Ollama and reports whether the model answered.
        </p>

        {#if baseUrlDirty}
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 break-words">
            Base URL has unsaved changes. Test uses the saved value <code>{testedBaseUrl}</code> — save first
            to test <code>{baseUrl}</code>.
          </p>
        {/if}

        {#if $modelList.length > 0}
          <ul
            role="listbox"
            aria-label="Models"
            class="mt-1 rounded-md border border-input bg-background divide-y divide-border"
          >
            {#each $modelList as m (m)}
              {@const state = testStates[m]}
              <li class="flex flex-col gap-1 px-3 py-2">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    role="option"
                    aria-selected={m === model}
                    class="flex flex-1 items-center gap-2 text-left text-sm truncate {m === model ? 'font-medium' : ''}"
                    onclick={() => setActiveModel(m)}
                  >
                    <span aria-hidden="true" class="shrink-0 {m === model ? 'text-indigo-600' : 'text-muted-foreground'}">
                      {m === model ? '●' : '○'}
                    </span>
                    <span class="truncate">{m}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Test {m}"
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onclick={() => handleTest(m)}
                    disabled={state?.status === 'testing'}
                  >
                    {state?.status === 'testing' ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove {m}"
                    class="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    onclick={() => handleRemove(m)}
                  >
                    ✕
                  </button>
                </div>
                <div aria-live="polite">
                  {#if state?.status === 'ok'}
                    <div class="flex flex-col gap-1">
                      <Tooltip>
                        <TooltipTrigger class="w-fit cursor-default">
                          <Badge class="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Working · {formatLatency(state.latencyMs)}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Sent one "ping" prompt to {testedBaseUrl}/api/chat and measured the round trip.
                        </TooltipContent>
                      </Tooltip>
                      <p class="text-xs text-muted-foreground break-words">
                        Ollama replied to a test prompt at <code>{testedBaseUrl}</code>.
                      </p>
                    </div>
                  {:else if state?.status === 'error'}
                    {@const diagnosis = diagnoseTestFailure(state.error, testedBaseUrl, m)}
                    <div class="flex flex-col gap-1">
                      <Badge variant="destructive" class="w-fit">{diagnosis.summary}</Badge>
                      {#if diagnosis.hint}
                        <p class="text-xs text-muted-foreground break-words">{diagnosis.hint}</p>
                      {/if}
                      <p class="text-xs text-destructive break-words font-mono">{diagnosis.detail}</p>
                      <p class="text-xs text-muted-foreground break-words">
                        POST {testedBaseUrl}/api/chat · model "{m}"
                      </p>
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-1 text-xs text-muted-foreground">No models yet — add one above.</p>
        {/if}
      </div>
    </section>

    <!-- System prompt section -->
    <section class="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-indigo-500 shrink-0"></div>
        <h2 class="text-sm font-semibold text-slate-800">System prompt</h2>
      </div>

      <div class="flex flex-col gap-1">
        <Textarea
          id="system-prompt"
          bind:value={promptText}
          rows={8}
          placeholder={DEFAULT_SYSTEM_PROMPT}
          class="font-mono text-xs"
        />
        <p class="text-xs text-muted-foreground">
          {#if $systemPromptOverride}
            Using your override. <strong>Reset to default</strong> restores the prompt that ships with
            Fillix.
          {:else}
            Using the default that ships with Fillix, shown above. Type here to override it.
          {/if}
          Tool instructions are always prepended, so the model keeps its web access either way.
        </p>
      </div>

      <div class="flex items-center gap-2 self-end">
        <Button
          variant="ghost"
          onclick={handleResetPrompt}
          disabled={!$systemPromptOverride && !promptText.trim()}
        >
          Reset to default
        </Button>
        <Button
          variant="secondary"
          onclick={handleSavePrompt}
          disabled={promptStatus === 'saving' || promptText.trim() === $systemPromptOverride}
        >
          {promptStatus === 'saving' ? 'Saving…' : promptStatus === 'saved' ? '✓ Saved' : 'Save prompt'}
        </Button>
      </div>
    </section>

    <!-- Save -->
    <Button
      variant="default"
      onclick={handleSave}
      disabled={saveStatus === 'saving'}
      class="self-end px-6"
      size="lg"
    >
      {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save Settings'}
    </Button>
  </div>
</TooltipProvider>
