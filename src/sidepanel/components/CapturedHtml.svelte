<script lang="ts">
  import {
    describeCaptureSize,
    describeTruncation,
    type PageCapture,
  } from '$lib/capture/html-budget';

  let { capture }: { capture: PageCapture } = $props();

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

  <!-- Interpolated, never {@html}: this is markup from an arbitrary site and must render
       as text. break-all because minified HTML has no spaces to wrap on — without it a
       single long line gives the whole panel a horizontal scrollbar. -->
  <pre
    class="whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-slate-700
           px-3 py-2">{capture.html}</pre>
</div>
