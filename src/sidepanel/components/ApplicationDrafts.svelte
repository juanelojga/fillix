<script lang="ts">
  import AnswerCard from './AnswerCard.svelte';
  import {
    answerable,
    draftedCount,
    draftingAll,
    drafts,
    fields,
    draftAll,
  } from '../stores/application';

  const total = $derived($answerable.length);
  /** Whether drafting has run at all — otherwise a run that returned only blanks reads
   *  exactly like never having pressed the button. */
  const attempted = $derived(Object.keys($drafts).length > 0);

  const summary = $derived.by(() => {
    if ($draftingAll) return `Writing answers… ${$draftedCount} of ${total} done`;
    if (!attempted) return `${total} ${total === 1 ? 'question' : 'questions'} to answer`;
    return `${$draftedCount} of ${total} answered`;
  });
</script>

{#if $fields.length > 0}
  <section class="border-b">
    <header class="flex items-center justify-between gap-2 px-3 py-2">
      <div class="flex flex-col gap-0.5 min-w-0">
        <h3 class="text-xs font-semibold text-slate-800">Application answers</h3>
        <p class="text-[11px] text-muted-foreground truncate">{summary}</p>
      </div>
      <!-- Not "Capture": every hint in capture-diagnostics.ts tells the user to press Capture
           again, and those stay true only while exactly one button carries that name. -->
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input
               bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60
               disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-ring"
        onclick={() => draftAll()}
        disabled={$draftingAll || total === 0}
      >
        {$draftingAll ? 'Drafting…' : attempted ? 'Draft all again' : 'Draft answers'}
      </button>
    </header>

    <p class="px-3 pb-2 text-[10px] text-muted-foreground leading-relaxed">
      Answers are written from your profile and nothing else, and every one says which sections
      it drew on. Read them before you paste anything into the page — nothing is written to
      Toptal, and Submit is never pressed for you.
    </p>

    <div class="border-t">
      {#each $fields as field (field.question)}
        <AnswerCard
          {field}
          state={$drafts[field.question] ?? { status: 'idle' }}
          busy={$draftingAll}
        />
      {/each}
    </div>
  </section>
{/if}
