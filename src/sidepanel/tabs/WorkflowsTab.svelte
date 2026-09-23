<script lang="ts">
  import CaptureResult from '$components/CaptureResult.svelte';
  import ComposerPanel from '$components/ComposerPanel.svelte';
  import LoveNotePanel from '$components/LoveNotePanel.svelte';
  import PlaybookPicker from '$components/PlaybookPicker.svelte';
  import WorkflowModelPicker from '$components/WorkflowModelPicker.svelte';
  import { describeCaptureRun } from '$lib/capture/capture-status';
  import { diagnoseCaptureFailure } from '$lib/capture/capture-diagnostics';
  import { describeComposerRun } from '$lib/linkedin/composer-status';
  import { describeNoteRun } from '$lib/love-note/note-status';
  import { resolvePlaybook } from '$lib/playbooks/registry';
  import type { RunChrome } from '$lib/playbooks/run-chrome';
  import { composerState } from '../stores/composer';
  import { startTopics } from '../stores/composer-topics';
  import { noteState } from '../stores/love-note';
  import { writeNotes } from '../stores/love-note-write';
  import { runState, runPlaybook, selectedPlaybookId } from '../stores/playbook';

  const playbook = $derived(resolvePlaybook($selectedPlaybookId));

  /**
   * The header asks a describer rather than switching inline, and that is what keeps the
   * word "Capture" out of every other playbook's chrome — every hint in
   * capture-diagnostics.ts tells the user to press Capture again, and those stay true only
   * while exactly one button carries that name.
   *
   * An exhaustive switch with a `never` default, the `background.ts` pattern: a fourth kind
   * fails `pnpm typecheck` here rather than silently borrowing another playbook's button.
   */
  const chrome = $derived.by((): RunChrome => {
    switch (playbook.kind) {
      case 'capture':
        return describeCaptureRun($runState);
      case 'compose':
        return describeComposerRun($composerState);
      case 'note':
        return describeNoteRun($noteState);
      default: {
        const _: never = playbook;
        return _;
      }
    }
  });

  const diagnosis = $derived(
    playbook.kind === 'capture' && $runState.status === 'failed'
      ? diagnoseCaptureFailure($runState.failure)
      : null,
  );

  function run(): void {
    switch (playbook.kind) {
      case 'capture':
        void runPlaybook();
        return;
      case 'compose':
        void startTopics();
        return;
      case 'note':
        void writeNotes();
        return;
      default: {
        const _: never = playbook;
        return _;
      }
    }
  }
</script>

<div class="flex flex-col h-full">
  <header class="shrink-0 flex items-start justify-between gap-2 border-b px-3 py-3">
    <div class="flex flex-col gap-0.5 min-w-0">
      <h2 class="text-sm font-semibold text-slate-800">Workflows</h2>
      <p class="text-[11px] text-muted-foreground truncate">{chrome.statusLine}</p>
    </div>
    <!-- Pickers and button share one row, as in NewsTab, ordered what to run, what runs
         it, then do it. The button names the action, and the action is the selected
         playbook's own: "Capture" for a capture, "Suggest topics" for the composer,
         "Write messages" for the love note.

         Three controls no longer fit a 240px panel at full width, so the group is not
         shrink-0 any more: the two pickers give first (their triggers truncate, so a long
         model name ellipsises rather than pushing anything off-panel) and the run button
         keeps its own shrink-0. Neither picker is disabled while a run is in flight — the
         model is read when a stage starts, so the next one picks up the change. -->
    <div class="flex items-center gap-1 min-w-0">
      <PlaybookPicker />
      <WorkflowModelPicker />
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input
               bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60
               disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-ring"
        onclick={run}
        disabled={chrome.busy}
      >
        <span class:animate-spin={chrome.busy} aria-hidden="true">⧉</span>
        {chrome.label}
      </button>
    </div>
  </header>

  <p class="sr-only" role="status" aria-live="polite">{chrome.announcement}</p>

  <div class="flex-1 overflow-y-auto min-h-0">
    {#if playbook.kind === 'compose'}
      <ComposerPanel description={playbook.description} />
    {:else if playbook.kind === 'note'}
      <LoveNotePanel description={playbook.description} />
    {:else if diagnosis}
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
