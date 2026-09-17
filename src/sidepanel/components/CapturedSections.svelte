<script lang="ts">
  import {
    describeCaptureSize,
    describeTruncation,
    type PageCapture,
  } from '$lib/capture/html-budget';
  import type { CapturedSection } from '$lib/playbooks/playbook';
  import type { JobBrief } from '$lib/playbooks/job-brief';
  import ApplicationDrafts from './ApplicationDrafts.svelte';
  import JobBriefCard from './JobBriefCard.svelte';
  import RawCapture from './RawCapture.svelte';

  let {
    capture,
    sections,
    brief = null,
  }: { capture: PageCapture; sections: CapturedSection[]; brief?: JobBrief | null } = $props();

  const truncation = $derived(describeTruncation(capture));
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

  {#if brief}
    <JobBriefCard {brief} />
  {/if}

  <ApplicationDrafts />

  {#each sections as section (section.heading)}
    <section class="border-b px-3 py-2 last:border-b-0">
      <h3 class="text-xs font-semibold text-slate-800">{section.heading}</h3>
      {#if section.found}
        <!-- Interpolated, never {@html}: this is text lifted off an arbitrary page. break-words
             rather than break-all — it is prose now, so it has spaces to wrap on. -->
        <p class="mt-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-700">
          {section.body}
        </p>
      {:else}
        <p class="mt-1 text-[11px] text-muted-foreground">
          Not found on this page — Toptal may have changed its markup.
        </p>
      {/if}
    </section>
  {/each}

  <!-- Last, and collapsed: the decoded sections are the answer, the markup behind them is
       the appeal. -->
  <RawCapture {capture} />
</div>
