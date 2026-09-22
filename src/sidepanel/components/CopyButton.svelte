<script lang="ts">
  /**
   * Puts a string on the clipboard, and words every way that can fail.
   *
   * Extracted from RawCapture rather than duplicated. What is shared is not the two-line
   * `writeText` call — that would be cheap to copy — but three things learned once: that the
   * API is *absent*, not merely rejecting, in a panel served over a scheme Chrome declines;
   * that the refusal is about panel focus and is equally true for every caller; and that the
   * return-to-idle timer is a leak and a fake-timer setup duplicated per copy.
   *
   * This is not one of the codebase's deliberate twins. `summary-model.ts` and
   * `workflow-model.ts` are twins because each *decides something different*. Here both
   * callers decide nothing — they hand the same browser the same string and report the same
   * refusal.
   */

  let {
    text,
    label = 'Copy',
    /** The tail of the failure hint, so it names something the user can actually see. */
    fallback = 'or select the text above by hand',
  }: { text: string; label?: string; fallback?: string } = $props();

  type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed';

  let status = $state<CopyStatus>('idle');
  let error = $state('');

  async function copy(): Promise<void> {
    status = 'copying';
    error = '';
    try {
      // Absent, not just rejecting, in a panel served over a scheme the API declines —
      // so the guard is a branch, not a formality.
      if (!navigator.clipboard) throw new Error('No clipboard API available to the side panel');
      await navigator.clipboard.writeText(text);
      status = 'copied';
      setTimeout(() => {
        if (status === 'copied') status = 'idle';
      }, 2000);
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const buttonLabel = $derived.by(() => {
    switch (status) {
      case 'copying':
        return 'Copying…';
      case 'copied':
        return '✓ Copied';
      default:
        return label;
    }
  });
</script>

<button
  type="button"
  class="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-[11px]
         hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  onclick={() => copy()}
  disabled={status === 'copying'}
>
  {buttonLabel}
</button>

{#if status === 'failed'}
  <div class="flex flex-col gap-1">
    <p class="text-[11px] font-medium text-destructive">Couldn't copy to the clipboard</p>
    <!-- The hint names the button by the label it is actually wearing. A hint pointing at a
         control that is not on screen is the failure the diagnostics convention exists to
         prevent, and this component is rendered under two different names. -->
    <p class="text-[11px] text-muted-foreground">
      Chrome refuses clipboard writes while the side panel is not the focused surface. Click
      anywhere in the panel and press {label} again, {fallback}.
    </p>
    <p class="text-[10px] font-mono text-destructive break-words">{error}</p>
  </div>
{/if}
