<script lang="ts">
  import CaptureResult from '$components/CaptureResult.svelte';
  import PlaybookPicker from '$components/PlaybookPicker.svelte';
  import { diagnoseCaptureFailure } from '$lib/capture/capture-diagnostics';
  import { resolvePlaybook } from '$lib/playbooks/registry';
  import { runState, runPlaybook, selectedPlaybookId } from '../stores/playbook';

  const playbook = $derived(resolvePlaybook($selectedPlaybookId));
  const capturing = $derived($runState.status === 'running');

  const diagnosis = $derived(
    $runState.status === 'failed' ? diagnoseCaptureFailure($runState.failure) : null,
  );

  const statusLine = $derived.by(() => {
    const state = $runState;
    switch (state.status) {
      case 'idle':
        return 'Nothing captured yet — press Capture';
      case 'running':
        return 'Reading the active tab…';
      case 'ready': {
        const time = new Date(state.capture.capturedAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `Captured ${time}`;
      }
      case 'failed':
        return "Couldn't capture the page";
    }
  });

  /**
   * One persistent region, never conditionally rendered — a live region only announces
   * mutations to a node that was already in the DOM.
   */
  const announcement = $derived.by(() => {
    const state = $runState;
    if (state.status === 'running') return 'Reading the active tab.';
    if (state.status === 'ready') return 'Page captured.';
    if (state.status === 'failed' && diagnosis) return `Capture failed. ${diagnosis.summary}`;
    return '';
  });
</script>

<div class="flex flex-col h-full">
  <header class="shrink-0 flex items-start justify-between gap-2 border-b px-3 py-3">
    <div class="flex flex-col gap-0.5 min-w-0">
      <h2 class="text-sm font-semibold text-slate-800">Workflows</h2>
      <p class="text-[11px] text-muted-foreground truncate">{statusLine}</p>
    </div>
    <!-- Picker and button share one row, as in NewsTab. The picker names the playbook,
         the button names the action — which is also why the verb stays "Capture" whatever
         is selected: every hint in capture-diagnostics.ts says "press Capture again". -->
    <div class="shrink-0 flex items-center gap-1">
      <PlaybookPicker />
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input
               bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60
               disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-ring"
        onclick={() => runPlaybook()}
        disabled={capturing}
      >
        <span class:animate-spin={capturing} aria-hidden="true">⧉</span>
        {capturing ? 'Capturing…' : 'Capture'}
      </button>
    </div>
  </header>

  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  <div class="flex-1 overflow-y-auto min-h-0">
    {#if diagnosis}
      <div class="flex flex-col gap-2 p-4">
        <span class="w-fit rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white">
          {diagnosis.summary}
        </span>
        <p class="text-xs text-muted-foreground">{diagnosis.hint}</p>
        <p class="text-xs text-destructive break-words font-mono">{diagnosis.detail}</p>
      </div>
    {:else if $runState.status === 'ready'}
      <CaptureResult capture={$runState.capture} sections={$runState.sections} />
    {:else}
      <div class="flex flex-col gap-2 p-4 text-center">
        <p class="text-sm font-medium text-slate-700">No page captured yet.</p>
        <p class="text-xs text-muted-foreground leading-relaxed">{playbook.description}</p>
      </div>
    {/if}
  </div>
</div>
