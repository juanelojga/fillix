<script lang="ts">
  import { Badge } from '$components/ui/badge';
  import { diagnoseSummaryFailure } from '$lib/news/summary-diagnostics';
  import type { NewsItem } from '../../types';
  import { summaries, summarize } from '../stores/news';
  import { ollamaConfig } from '../stores/settings';

  interface Props {
    item: NewsItem;
  }

  let { item }: Props = $props();

  const state = $derived($summaries[item.id]);
  const pending = $derived(state?.status === 'fetching' || state?.status === 'summarizing');
  const diagnosis = $derived.by(() => {
    if (state?.status !== 'error') return null;
    return diagnoseSummaryFailure(
      state.stage,
      state.error,
      state.url,
      $ollamaConfig?.baseUrl ?? 'http://localhost:11434',
      state.model,
    );
  });

  function formatElapsed(ms: number): string {
    return `${(ms / 1000).toFixed(1)} s`;
  }
</script>

<div class="flex flex-col gap-2 px-1 pb-3 pl-2 border-l-2 border-slate-200" aria-busy={pending}>
  {#if state?.status === 'fetching'}
    <p class="text-xs text-muted-foreground animate-pulse">
      Fetching the article from {item.source}…
    </p>
  {:else if state?.status === 'summarizing'}
    <p class="text-xs text-muted-foreground animate-pulse">
      Summarizing with {state.model} — usually 10–20 seconds.
    </p>
  {:else if state?.status === 'ready'}
    <p class="text-sm leading-relaxed text-slate-700">{state.summary.summary}</p>
    {#if state.summary.keyPoints.length > 0}
      <ul class="flex flex-col gap-1 pl-4 list-disc marker:text-slate-400">
        {#each state.summary.keyPoints as point (point)}
          <li class="text-xs text-slate-600 leading-relaxed">{point}</li>
        {/each}
      </ul>
    {/if}
    {#if state.model}
      <p class="text-[10px] text-muted-foreground">
        Summarized locally by {state.model} in {formatElapsed(state.elapsedMs)}.
      </p>
    {/if}
  {:else if diagnosis}
    <Badge variant="destructive" class="w-fit">{diagnosis.summary}</Badge>
    <p class="text-xs text-muted-foreground break-words">{diagnosis.hint}</p>
    <p class="text-xs text-destructive break-words font-mono">{diagnosis.detail}</p>
    <p class="text-[10px] text-muted-foreground break-all font-mono">{diagnosis.context}</p>
    <button
      type="button"
      class="w-fit rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onclick={() => summarize(item.id, { force: true })}
    >
      Try again
    </button>
  {/if}

  <!-- Present in every state, including pending: if the model is slow the user can
       just go and read the thing. -->
  <a
    class="w-fit text-xs text-sky-700 hover:underline focus-visible:outline-none
           focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    href={item.url}
    target="_blank"
    rel="noopener noreferrer"
  >
    ↗ Open article on {item.source}
  </a>
</div>
