<script lang="ts">
  import {
    describeCaptureSize,
    describeTruncation,
    type PageCapture,
  } from '$lib/capture/html-budget';
  import type { CapturedSection } from '$lib/playbooks/playbook';
  import ApplicationDrafts from './ApplicationDrafts.svelte';
  import RawCapture from './RawCapture.svelte';

  let { capture, sections }: { capture: PageCapture; sections: CapturedSection[] } = $props();

  const truncation = $derived(describeTruncation(capture));

  /**
   * The decoded sections are no longer shown — the answers are what the user acts on, and the
   * job text is already on the page behind the panel. What still has to reach the screen is a
   * hook that has *moved*: `data-pendoid` is Pendo instrumentation and is simply absent when
   * Pendo is blocked, which quietly empties the brief the drafting runs on. Named in one line
   * rather than seven empty blocks.
   */
  const missing = $derived(sections.filter((s) => !s.found).map((s) => s.heading));
</script>

<div class="flex flex-col">
  <div class="shrink-0 border-b px-3 py-2">
    <p class="text-xs font-medium text-slate-700 truncate">{capture.title}</p>
    <p class="text-[10px] text-muted-foreground font-mono break-all">{capture.url}</p>
    <p class="text-[11px] text-muted-foreground">{describeCaptureSize(capture)}</p>
  </div>

  {#if truncation}
    <p
      class="m-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      {truncation}
    </p>
  {/if}

  {#if missing.length > 0}
    <p
      class="m-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
    >
      Not found on this page: {missing.join(' · ')} — Toptal may have changed its markup.
    </p>
  {/if}

  <ApplicationDrafts />

  <!-- Last, and collapsed: the answers are the point, the markup behind them is the appeal. -->
  <RawCapture {capture} />
</div>
