<script lang="ts">
  import { isTruncated, type PageCapture } from '$lib/capture/html-budget';

  let { capture }: { capture: PageCapture } = $props();

  /**
   * Enough to recognise the document and find a hook by eye, never the whole capture:
   * half a megabyte in one text node is exactly what HTML_CAPTURE_LIMIT exists to avoid,
   * and re-introducing it here would undo the cap one layer further down.
   */
  const PREVIEW_CHARS = 2000;

  type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed';

  let copyStatus = $state<CopyStatus>('idle');
  let copyError = $state('');

  const preview = $derived(capture.html.slice(0, PREVIEW_CHARS));
  const previewTrimmed = $derived(capture.html.length > PREVIEW_CHARS);

  async function copyHtml(): Promise<void> {
    copyStatus = 'copying';
    copyError = '';
    try {
      // Absent, not just rejecting, in a panel served over a scheme the API declines —
      // so the guard is a branch, not a formality.
      if (!navigator.clipboard) throw new Error('No clipboard API available to the side panel');
      await navigator.clipboard.writeText(capture.html);
      copyStatus = 'copied';
      setTimeout(() => {
        if (copyStatus === 'copied') copyStatus = 'idle';
      }, 2000);
    } catch (err) {
      copyStatus = 'failed';
      copyError = err instanceof Error ? err.message : String(err);
    }
  }

  const copyLabel = $derived.by(() => {
    switch (copyStatus) {
      case 'copying':
        return 'Copying…';
      case 'copied':
        return '✓ Copied';
      default:
        return 'Copy HTML';
    }
  });
</script>

<!-- Collapsed by default: this is the markup behind the decoded sections, wanted only when
     a hook has moved or a selector has to be written against the real page. -->
<details class="border-b px-3 py-2 last:border-b-0">
  <summary class="cursor-pointer text-xs font-semibold text-slate-800">Raw HTML</summary>

  <div class="mt-2 flex flex-col gap-2">
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-[11px]
               hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onclick={() => copyHtml()}
        disabled={copyStatus === 'copying'}
      >
        {copyLabel}
      </button>
    </div>

    {#if isTruncated(capture)}
      <p
        class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
      >
        This copy stops at the cap, so the end of the document — including the application form,
        which sits near the bottom — may be missing. Raise HTML_CAPTURE_LIMIT in html-budget.ts
        and press Capture again if you need the page whole.
      </p>
    {/if}

    {#if copyStatus === 'failed'}
      <div class="flex flex-col gap-1">
        <p class="text-[11px] font-medium text-destructive">Couldn't copy to the clipboard</p>
        <p class="text-[11px] text-muted-foreground">
          Chrome refuses clipboard writes while the side panel is not the focused surface. Click
          anywhere in the panel and press Copy HTML again, or select the preview below by hand.
        </p>
        <p class="text-[10px] font-mono text-destructive break-words">{copyError}</p>
      </div>
    {/if}

    <!-- Interpolated, never {@html}: this is markup lifted off an arbitrary page, and the
         whole point is to read it, not to run it. -->
    <pre
      class="max-h-64 overflow-auto rounded-md bg-slate-50 p-2 text-[10px] leading-snug
             text-slate-700 whitespace-pre-wrap break-all">{preview}</pre>

    {#if previewTrimmed}
      <p class="text-[11px] text-muted-foreground">
        Preview only — Copy HTML puts the whole capture on the clipboard.
      </p>
    {/if}
  </div>
</details>
