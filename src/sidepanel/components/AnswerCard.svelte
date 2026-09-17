<script lang="ts">
  import { Textarea } from '$components/ui/textarea';
  import { describeLocator, isStableLocator } from '$lib/capture/field-locator';
  import type { ApplicationField } from '$lib/playbooks/toptal-application-form';
  import { editDraft, redraft, type DraftState } from '../stores/application';

  let {
    field,
    state,
    busy = false,
  }: { field: ApplicationField; state: DraftState; busy?: boolean } = $props();

  const drafted = $derived(state.status === 'drafted' ? state : null);
  const failed = $derived(state.status === 'failed' ? state.diagnosis : null);

  /** A locator that points at a *place* rather than a control is worth saying out loud. */
  const shakyLocator = $derived(
    field.locator !== null && !isStableLocator(field.locator) ? describeLocator(field.locator) : '',
  );
</script>

<article class="border-b px-3 py-3 last:border-b-0">
  <p class="text-[11px] font-medium text-slate-800 whitespace-pre-wrap break-words">
    {field.question}
  </p>

  {#if field.locator === null}
    <!-- Named, never dropped: the question is on the page whether or not we can fill it, and a
         silently missing card reads as "Toptal did not ask this". -->
    <p class="mt-1.5 text-[11px] text-muted-foreground">{field.unfillableReason}</p>
    {#if field.prefilled}
      <p class="mt-1 text-[11px] text-slate-700">
        Currently set to <span class="font-medium">{field.prefilled}</span>.
      </p>
    {/if}
  {:else if state.status === 'drafting'}
    <p class="mt-1.5 text-[11px] text-muted-foreground">Writing an answer…</p>
  {:else if failed}
    <div class="mt-1.5 flex flex-col gap-1">
      <span class="w-fit rounded-md bg-destructive px-2 py-0.5 text-[10px] font-medium text-white">
        {failed.summary}
      </span>
      <p class="text-[11px] text-muted-foreground">{failed.hint}</p>
      {#if 'detail' in failed && failed.detail}
        <p class="text-[10px] font-mono text-destructive break-words">{failed.detail}</p>
      {/if}
      <button
        type="button"
        class="mt-1 w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
               hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onclick={() => redraft(field.question)}
        disabled={busy}
      >
        Re-draft
      </button>
    </div>
  {:else if drafted}
    <label class="sr-only" for="answer-{field.question}">Answer to: {field.question}</label>
    <Textarea
      id="answer-{field.question}"
      value={drafted.edited}
      oninput={(e: Event) =>
        editDraft(field.question, (e.currentTarget as HTMLTextAreaElement).value)}
      rows={5}
      class="mt-1.5 text-xs"
      placeholder="Nothing in your profile answered this — write it yourself, or leave it blank."
    />

    <div class="mt-1.5 flex flex-col gap-1">
      {#if drafted.draft.drewOn.length > 0}
        <!-- The citation is the point. It is what makes a claim checkable in one glance
             instead of requiring the whole profile to be re-read. -->
        <p class="text-[10px] text-muted-foreground">
          Drew on: {drafted.draft.drewOn.join(' · ')}
        </p>
      {:else}
        <p class="text-[10px] text-amber-700">
          Your profile had nothing for this one. Anything written here is yours, not drafted.
        </p>
      {/if}

      {#if drafted.draft.gaps.length > 0}
        <p class="text-[10px] text-amber-700">
          Not in your profile: {drafted.draft.gaps.join(' · ')}
        </p>
      {/if}

      {#if shakyLocator}
        <p class="text-[10px] text-amber-700">
          This field was {shakyLocator} — check it lands in the right box before you submit.
        </p>
      {/if}

      <button
        type="button"
        class="mt-0.5 w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
               hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onclick={() => redraft(field.question)}
        disabled={busy}
      >
        Re-draft
      </button>
    </div>
  {:else}
    <p class="mt-1.5 text-[11px] text-muted-foreground">Not drafted yet.</p>
  {/if}
</article>
