<script lang="ts">
  import ComposerFailure from './ComposerFailure.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import NoteVariants from './NoteVariants.svelte';
  import { noteState } from '../stores/love-note';

  let { description }: { description: string } = $props();

  const state = $derived($noteState);
</script>

<div class="flex flex-col">
  <!-- The seed box is on screen in every state, idle included — unlike the composer's, which
       is an optional nudge, here the seed *is* the input. Through a failure too, so a retry
       needs no retyping. -->
  {#if state.status === 'idle'}
    <NoteVariants variants={[]} chosen={0} />
    <div class="flex flex-col gap-2 p-4 text-center">
      <p class="text-sm font-medium text-slate-700">No messages yet.</p>
      <p class="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  {:else if state.status === 'running'}
    <NoteVariants variants={[]} chosen={0} />
    <p class="px-3 py-3 text-xs text-muted-foreground">
      Writing three messages in Spanish — usually 10–20 seconds.
    </p>
  {:else if state.status === 'failed'}
    <NoteVariants variants={[]} chosen={0} />
    <ComposerFailure diagnosis={state.diagnosis} />
  {:else}
    <NoteVariants variants={state.variants} chosen={state.chosen} />
    <NoteEditor edited={state.edited} />
  {/if}

  <!-- Said once, on screen, the `ComposerPanel` rule: there is no fill and no send, and a
       button the user hunts for and cannot find is worse than a line saying so. -->
  <p class="border-t px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
    Messages are copied, never sent for you.
  </p>
</div>
