<script lang="ts">
  import TopicCard from './TopicCard.svelte';
  import { Textarea } from '$components/ui/textarea';
  import type { TopicSuggestion } from '$lib/linkedin/suggest-topics';
  import { seed } from '../stores/composer';

  let { topics }: { topics: TopicSuggestion[] } = $props();
</script>

<section>
  <div class="border-b px-3 py-2">
    <label class="text-[11px] font-medium text-slate-700" for="composer-seed">
      Seed <span class="font-normal text-muted-foreground">(optional)</span>
    </label>
    <!-- Never disabled while a run is in flight, the rule the model pickers follow: the seed
         is read when the button is pressed, so typing during a run simply feeds the next one. -->
    <Textarea
      id="composer-seed"
      value={$seed}
      oninput={(e: Event) => seed.set((e.currentTarget as HTMLTextAreaElement).value)}
      rows={2}
      class="mt-1 text-xs"
      placeholder="A thought, a client moment, a question someone asked — or leave it blank."
    />
  </div>

  {#if topics.length > 0}
    <header class="px-3 py-2">
      <h3 class="text-xs font-semibold text-slate-800">Topics</h3>
      <p class="text-[11px] text-muted-foreground">
        Five you could write from real experience. Pick one.
      </p>
    </header>

    {#each topics as topic, index (topic.title)}
      <TopicCard {topic} {index} />
    {/each}
  {/if}
</section>
