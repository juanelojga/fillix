<script lang="ts">
  import { CATEGORY_LABEL } from '$lib/news/categories';
  import NewsItemRow from '$components/NewsItemRow.svelte';
  import NewsModelPicker from '$components/NewsModelPicker.svelte';
  import { expandedItemId, feedState, newsItems, refreshNews, summaries } from '../stores/news';

  const loading = $derived($feedState.status === 'loading');
  const degraded = $derived($feedState.status === 'ready' ? $feedState.degraded : []);

  const statusLine = $derived.by(() => {
    const state = $feedState;
    switch (state.status) {
      case 'idle':
        return 'Not loaded yet — press Refresh';
      case 'loading':
        return 'Loading the latest stories…';
      case 'ready': {
        const time = new Date(state.fetchedAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        const count = $newsItems.length;
        return `Updated ${time} · ${count} ${count === 1 ? 'story' : 'stories'}`;
      }
      case 'error':
        return "Couldn't load news";
    }
  });

  const degradedNotice = $derived.by(() => {
    if (degraded.length === 0) return '';
    const names = degraded.map((d) => CATEGORY_LABEL[d.category]).join(' and ');
    const verb = degraded.length === 1 ? "feed didn't answer" : "feeds didn't answer";
    return `Showing ${$newsItems.length} of 6 — the ${names} ${verb}. Press Refresh to try again.`;
  });

  /**
   * One persistent region, never conditionally rendered. A live region only announces
   * mutations to a node that was already in the DOM, so announcing from inside the
   * summary panel (which is inserted already containing its pending text) would be
   * silent. The visible pending text is deliberately not aria-live, or every change
   * would be read twice.
   */
  const announcement = $derived.by(() => {
    const state = $feedState;
    if (state.status === 'loading') return 'Loading news stories.';
    if (state.status === 'error') return `Couldn't load news. ${state.error}`;

    const id = $expandedItemId;
    if (id === null) {
      return state.status === 'ready' ? `${$newsItems.length} stories loaded.` : '';
    }
    const summary = $summaries[id];
    if (summary?.status === 'fetching') return 'Fetching the article.';
    if (summary?.status === 'summarizing')
      return 'Summarizing the article. This usually takes 10 to 20 seconds.';
    if (summary?.status === 'ready') return 'Summary ready.';
    if (summary?.status === 'error') return `Summary failed. ${summary.error}`;
    return '';
  });
</script>

<div class="flex flex-col h-full">
  <header class="shrink-0 flex items-start justify-between gap-2 border-b px-3 py-3">
    <div class="flex flex-col gap-0.5 min-w-0">
      <h2 class="text-sm font-semibold text-slate-800">News</h2>
      <p class="text-[11px] text-muted-foreground truncate">{statusLine}</p>
    </div>
    <!-- Picker and Refresh share one row. At sidepanel width a long model name would
         otherwise push Refresh off-panel, so the trigger caps itself at max-w-[120px] and
         truncates while Refresh stays shrink-0. The picker is deliberately never disabled
         while a summary runs — that model is already captured, and the next story should
         use the new choice. -->
    <div class="shrink-0 flex items-center gap-1">
      <NewsModelPicker />
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input
               bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60
               disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-ring"
        onclick={() => refreshNews()}
        disabled={loading}
      >
        <span class:animate-spin={loading} aria-hidden="true">⟳</span>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </header>

  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  <div class="flex-1 overflow-y-auto min-h-0">
    {#if $feedState.status === 'error'}
      <div class="flex flex-col gap-2 p-4">
        <span
          class="w-fit rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white"
        >
          Couldn't load news
        </span>
        <p class="text-xs text-muted-foreground">
          None of the news sources answered. Check your connection, then press Refresh.
          Headlines come from Hacker News and Wikipedia.
        </p>
        <p class="text-xs text-destructive break-words font-mono">{$feedState.error}</p>
      </div>
    {:else if $newsItems.length === 0}
      <div class="flex flex-col gap-2 p-4 text-center">
        <p class="text-sm font-medium text-slate-700">No stories loaded yet.</p>
        <p class="text-xs text-muted-foreground leading-relaxed">
          Refresh pulls 6 headlines across AI, Technology, Software development and
          Curiosities — about a second. Summaries are generated only when you open a story.
        </p>
      </div>
    {:else}
      {#if degradedNotice}
        <p
          class="m-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {degradedNotice}
        </p>
      {/if}
      <!-- Keyed by id so unchanged rows survive a refresh without being torn down. -->
      {#each $newsItems as item (item.id)}
        <NewsItemRow {item} />
      {/each}
    {/if}
  </div>
</div>
