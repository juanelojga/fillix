<script lang="ts">
  import { slide } from 'svelte/transition';
  import { Badge } from '$components/ui/badge';
  import { CATEGORY_BADGE_CLASS, CATEGORY_LABEL } from '$lib/news/categories';
  import type { NewsItem } from '../../types';
  import { expandedItemId, setExpanded, summaries } from '../stores/news';
  import NewsSummary from './NewsSummary.svelte';

  interface Props {
    item: NewsItem;
  }

  let { item }: Props = $props();

  const isOpen = $derived($expandedItemId === item.id);
  const state = $derived($summaries[item.id]);
  const busy = $derived(state?.status === 'fetching' || state?.status === 'summarizing');
</script>

<div class="border-b border-slate-100 last:border-b-0">
  <h3 class="flex">
    <button
      type="button"
      data-news-trigger
      id="news-trigger-{item.id}"
      class="flex flex-1 items-start gap-2 px-3 py-2.5 text-left rounded-md
             hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring"
      aria-expanded={isOpen}
      aria-controls="news-panel-{item.id}"
      onclick={() => setExpanded(isOpen ? null : item.id)}
    >
      <span class="flex flex-col gap-1 min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <Badge class="{CATEGORY_BADGE_CLASS[item.category]} shrink-0 text-[10px] uppercase">
            {CATEGORY_LABEL[item.category]}
          </Badge>
          <!-- A word, never a bare spinner: the status has to survive being read aloud. -->
          {#if busy}
            <span class="text-[10px] text-muted-foreground animate-pulse">Summarizing…</span>
          {:else if state?.status === 'ready'}
            <span class="text-[10px] text-muted-foreground">Summary ready</span>
          {:else if state?.status === 'error'}
            <span class="text-[10px] text-destructive">Summary failed</span>
          {/if}
        </span>
        <!-- line-clamp-3, not truncate: a headline at 400px is 2-3 lines and is
             useless cut to one. -->
        <span class="text-sm font-medium leading-snug text-slate-800 line-clamp-3">
          {item.title}
        </span>
        <span class="text-[11px] text-muted-foreground truncate">
          {item.source} · {item.meta}
        </span>
      </span>
      <span class="chevron shrink-0 text-muted-foreground" class:open={isOpen} aria-hidden="true">
        ›
      </span>
    </button>
  </h3>

  {#if isOpen}
    <div
      id="news-panel-{item.id}"
      role="region"
      aria-labelledby="news-trigger-{item.id}"
      class="px-3"
      transition:slide={{ duration: 160 }}
    >
      <NewsSummary {item} />
    </div>
  {/if}
</div>

<style>
  .chevron {
    font-size: 15px;
    line-height: 1.4;
    transition: transform 180ms ease;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
</style>
