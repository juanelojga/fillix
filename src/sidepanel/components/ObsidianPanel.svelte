<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from '$components/ui/accordion';
  import { Input } from '$components/ui/input';
  import { Button } from '$components/ui/button';
  import { getObsidianConfig, setObsidianConfig } from '../../lib/storage';
  import type { ObsidianConfig, MessageResponse } from '../../types';

  let host = $state('localhost');
  let port = $state(27123);
  let apiKey = $state('');
  let systemPromptPath = $state('');
  let testStatus = $state<'idle' | 'testing' | 'ok' | 'error'>('idle');
  let testError = $state('');

  onMount(async () => {
    const cfg = await getObsidianConfig();
    host = cfg.host;
    port = cfg.port;
    apiKey = cfg.apiKey;
    systemPromptPath = cfg.systemPromptPath ?? '';
  });

  async function handleTestConnection() {
    testStatus = 'testing';
    testError = '';
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'OBSIDIAN_TEST_CONNECTION',
      })) as MessageResponse;
      testStatus = response.ok ? 'ok' : 'error';
      if (!response.ok) testError = response.error;
    } catch (e) {
      testStatus = 'error';
      testError = e instanceof Error ? e.message : 'Unknown error';
    }
  }

  async function handleSave() {
    const cfg: ObsidianConfig = {
      host,
      port,
      apiKey,
      systemPromptPath: systemPromptPath || undefined,
    };
    await setObsidianConfig(cfg);
  }
</script>

<div class="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
<Accordion type="single">
  <AccordionItem value="obsidian" class="border-none">
    <AccordionTrigger class="text-sm font-semibold px-4 py-3 hover:no-underline">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-violet-500 shrink-0"></div>
        Obsidian
      </div>
    </AccordionTrigger>
    <AccordionContent>
      <div class="flex flex-col gap-3 px-4 pb-4 pt-1 border-t border-slate-200">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="obs-host">Host</label>
          <Input id="obs-host" bind:value={host} placeholder="localhost" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="obs-port">Port</label>
          <Input
            id="obs-port"
            type="number"
            value={port}
            oninput={(e) => {
              port = parseInt((e.currentTarget as HTMLInputElement).value) || 27123;
            }}
            placeholder="27123"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="obs-apikey">API key</label>
          <Input
            id="obs-apikey"
            type="password"
            bind:value={apiKey}
            placeholder="Obsidian Local REST API key"
            autocomplete="off"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="obs-prompt-path"
            >System prompt path</label
          >
          <Input
            id="obs-prompt-path"
            bind:value={systemPromptPath}
            placeholder="prompts/system.md"
          />
        </div>

        <div class="flex items-center gap-3 pt-1">
          <Button
            variant="outline"
            onclick={handleTestConnection}
            disabled={testStatus === 'testing'}
            class="border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-600"
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          {#if testStatus === 'ok'}
            <span class="text-xs text-emerald-600 font-medium">✓ Connected</span>
          {:else if testStatus === 'error'}
            <span class="text-xs text-destructive">{testError || 'Connection failed'}</span>
          {/if}
        </div>

        <Button onclick={handleSave} class="self-end">Save Obsidian settings</Button>
      </div>
    </AccordionContent>
  </AccordionItem>
</Accordion>
</div>
