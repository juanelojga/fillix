<script lang="ts">
  import { Badge } from '$components/ui/badge';
  import { PILLAR_LABEL } from '$lib/linkedin/post-taxonomy';
  import type { TopicSuggestion } from '$lib/linkedin/suggest-topics';

  import { chooseTopic } from '../stores/composer-brief';

  let { topic, index }: { topic: TopicSuggestion; index: number } = $props();
</script>

<article class="border-b px-3 py-2.5">
  <div class="flex items-start justify-between gap-2">
    <h4 class="text-xs font-semibold text-slate-800">{topic.title}</h4>
    <!-- The pillar is not decoration: one pillar per post is a rule the voice spec states,
         and it is what the angle brief will be locked to. Showing it here is what lets the
         user notice a topic filed under the wrong one before a post is written from it. -->
    <Badge class="shrink-0 text-[10px] uppercase">{PILLAR_LABEL[topic.pillar]}</Badge>
  </div>

  <p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">{topic.angle}</p>

  <button
    type="button"
    class="mt-2 w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
           hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onclick={() => chooseTopic(topic.title)}
  >
    Use topic {index + 1}
  </button>
</article>
