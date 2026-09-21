<script lang="ts">
  import AnswerCard from './AnswerCard.svelte';
  import { summariseFill } from '$lib/capture/fill-outcome';
  import {
    answerable,
    draftedCount,
    draftingAll,
    drafts,
    fields,
    draftAll,
    fillApproved,
    fillable,
    fillState,
  } from '../stores/application';

  const total = $derived($answerable.length);
  /** Whether drafting has run at all — otherwise a run that returned only blanks reads
   *  exactly like never having pressed the button. */
  const attempted = $derived(Object.keys($drafts).length > 0);

  const filling = $derived($fillState.status === 'filling');
  const outcomes = $derived($fillState.status === 'done' ? $fillState.outcomes : {});
  const refusal = $derived($fillState.status === 'refused' ? $fillState.diagnosis : null);
  const fillReport = $derived(
    $fillState.status === 'done' ? summariseFill(Object.values($fillState.outcomes)) : '',
  );

  /**
   * The count is of what can be *answered*, while the list below is every field on the page.
   * Naming the difference is what stops "2 questions to answer" reading as a miscount above
   * four cards.
   */
  const picks = $derived($fields.length - $answerable.length);
  const pickSuffix = $derived(picks > 0 ? ` · ${picks} you pick yourself` : '');

  const summary = $derived.by(() => {
    if ($draftingAll) return `Writing answers… ${$draftedCount} of ${total} done`;
    if (!attempted)
      return `${total} ${total === 1 ? 'question' : 'questions'} to answer${pickSuffix}`;
    return `${$draftedCount} of ${total} answered${pickSuffix}`;
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

    {#if $fillable.length > 0 || $fillState.status !== 'idle'}
      <div class="flex items-center justify-between gap-2 border-t px-3 py-2">
        <p class="text-[11px] text-muted-foreground">
          {#if filling}
            Writing into the page…
          {:else if fillReport}
            {fillReport}
          {:else}
            {$fillable.length}
            {$fillable.length === 1 ? 'answer' : 'answers'} ready to write into the page
          {/if}
        </p>
        <button
          type="button"
          class="shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs
                 hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onclick={() => fillApproved()}
          disabled={filling || $fillable.length === 0}
        >
          {filling ? 'Filling…' : 'Fill page'}
        </button>
      </div>

      {#if refusal}
        <div class="flex flex-col gap-1 border-t px-3 py-2">
          <span
            class="w-fit rounded-md bg-destructive px-2 py-0.5 text-[10px] font-medium text-white"
          >
            {refusal.summary}
          </span>
          <p class="text-[11px] text-muted-foreground">{refusal.hint}</p>
          <p class="text-[10px] font-mono text-destructive break-words">{refusal.detail}</p>
        </div>
      {/if}
    {/if}

    <!-- One line, but both promises survive the trim: grounded in the profile *or* a stated
         gap, and nothing leaves the machine. Neither is visible from the cards alone. -->
    <p class="px-3 pb-2 text-[10px] text-muted-foreground leading-relaxed">
      Written from your profile only — each answer names what it drew on, or says you do not
      have that experience. Submit is never pressed for you.
    </p>

    <div class="border-t">
      {#each $fields as field (field.question)}
        <AnswerCard
          {field}
          state={$drafts[field.question] ?? { status: 'idle' }}
          busy={$draftingAll}
          outcome={outcomes[field.question] ?? null}
        />
      {/each}
    </div>
  </section>
{:else}
  <!-- With the brief and the decoded sections gone this is the only thing between a capture
       that found no form and a blank tab. -->
  <p class="border-b px-3 py-3 text-[11px] text-muted-foreground">
    No application questions on this page — open the job's apply step, or Toptal may have
    changed its markup.
  </p>
{/if}
