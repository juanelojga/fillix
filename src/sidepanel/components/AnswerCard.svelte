<script lang="ts">
  import { Textarea } from '$components/ui/textarea';
  import { describeLocator, isStableLocator } from '$lib/capture/field-locator';
  import type { ApplicationField } from '$lib/playbooks/toptal-application-form';
  import { describeFillOutcome } from '$lib/capture/fill-outcome';
  import type { FillOutcome } from '$lib/capture/fill-active-tab';
  import { summarizeSchedule } from '$lib/answers/schedule-summary';
  import { editDraft, redraft, type DraftState } from '../stores/application';

  let {
    field,
    state,
    busy = false,
    outcome = null,
  }: {
    field: ApplicationField;
    state: DraftState;
    busy?: boolean;
    outcome?: FillOutcome | null;
  } = $props();

  const drafted = $derived(state.status === 'drafted' ? state : null);
  const failed = $derived(state.status === 'failed' ? state.diagnosis : null);

  const fillProblem = $derived(outcome && !outcome.ok ? describeFillOutcome(outcome) : '');

  /** Computed before the model ran, so it is shown as a fact rather than as part of the answer. */
  const schedule = $derived(drafted?.schedule ? summarizeSchedule(drafted.schedule) : null);

  /**
   * Toptal refuses a pitch under its stated minimum. Said here rather than asked of the model:
   * the prompt deliberately carries no length target, because a model given one pads an answer
   * it cannot support — which is the fabrication `answer-prompt.ts` exists to stop. A grounded
   * pitch clears the floor on its own, so this only ever fires on one the user must finish.
   *
   * Silent on an empty box: that case already says "Your profile had nothing for this one",
   * and two warnings over one blank field is noise.
   */
  const shortAnswer = $derived.by(() => {
    if (!drafted || field.minChars === 0) return '';
    const length = drafted.edited.trim().length;
    if (length === 0 || length >= field.minChars) return '';
    return `Toptal needs ${field.minChars}+ characters — this is ${length}. Add to it before filling.`;
  });

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
    <p class="mt-1.5 text-[11px] text-muted-foreground">
      {field.unfillableReason}{#if field.prefilled}
        <span class="text-slate-700">
          Now: <span class="font-medium">{field.prefilled}</span>.
        </span>
      {/if}
    </p>
  {:else if state.status === 'drafting'}
    <p class="mt-1.5 text-[11px] text-muted-foreground">Writing an answer…</p>
  {:else if failed}
    <div class="mt-1.5 flex flex-col gap-1">
      <span class="w-fit rounded-md bg-destructive px-2 py-0.5 text-[10px] font-medium text-white">
        {failed.summary}
      </span>
      <p class="text-[11px] text-muted-foreground">{failed.hint}</p>
      {#if 'detail' in failed && failed.detail}
        <!-- Bounded: the detail now carries the head and tail of the model's real reply, and an
             unbounded one would push the remaining questions off screen on a narrow panel. -->
        <p class="max-h-24 overflow-y-auto text-[10px] font-mono text-destructive break-words">
          {failed.detail}
        </p>
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
      {:else if drafted.draft.noExperience}
        <!-- It must say the answer cites nothing, not merely that it is a gap. This is the
             only thing standing between the user and a short uncited sentence that reads
             like a denial but still claims something. -->
        <p class="text-[10px] text-amber-700">
          Not in your profile — this answer says so, and cites nothing. Edit it if that is wrong.
        </p>
      {:else}
        <p class="text-[10px] text-amber-700">
          Your profile had nothing for this one. Anything written here is yours, not drafted.
        </p>
      {/if}

      {#if schedule && schedule.lines.length > 0}
        <!-- The pairing is the check: the question's own words beside the converted time. A
             wrong reading is visible here without reading the answer at all. -->
        <div class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
          <p class="text-[10px] font-medium text-slate-700">Checked against your hours</p>
          {#each schedule.lines as line (line.source)}
            <p class="mt-0.5 text-[10px] text-slate-600 break-words">
              <span class="text-slate-500">{line.source}</span>
              <span class="mx-0.5">→</span>
              <span>{line.local}</span>
              <span
                class={line.status === 'available'
                  ? 'font-medium text-emerald-700'
                  : line.status === 'partial'
                    ? 'font-medium text-amber-700'
                    : 'font-medium text-destructive'}
              >
                {line.status === 'available'
                  ? 'free'
                  : line.status === 'partial'
                    ? 'partly free'
                    : 'not free'}
              </span>
            </p>
          {/each}
        </div>
      {/if}

      {#if schedule && schedule.unchecked.length > 0}
        <p class="text-[10px] text-amber-700">
          Not checked: {schedule.unchecked.join(' · ')}
        </p>
      {/if}

      {#if drafted.draft.gaps.length > 0}
        <p class="text-[10px] text-amber-700">
          Not in your profile: {drafted.draft.gaps.join(' · ')}
        </p>
      {/if}

      {#if outcome?.ok}
        <p class="text-[10px] text-emerald-700">Written into the page.</p>
      {/if}

      {#if fillProblem}
        <p class="text-[10px] text-destructive">{fillProblem}</p>
      {/if}

      {#if shortAnswer}
        <p class="text-[10px] text-amber-700">{shortAnswer}</p>
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
