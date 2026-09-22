<script lang="ts">
  import type { TopicResearch } from '$lib/linkedin/topic-research';

  let { research }: { research: TopicResearch } = $props();
</script>

<section class="border-b px-3 py-2">
  <!-- Every degraded source is named, never silently dropped — the rule CaptureResult follows
       for a section it could not find. A post written from Hacker News alone reads thinner,
       and the only thing that would say why is this line. -->
  {#each research.degraded as failure (failure.origin)}
    <div class="mb-1.5 flex flex-col gap-0.5">
      <span
        class="w-fit rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]
               font-medium text-amber-900"
      >
        {failure.summary}
      </span>
      <p class="text-[10px] text-muted-foreground leading-relaxed">{failure.hint}</p>
    </div>
  {/each}

  {#if research.sources.length > 0}
    <details>
      <summary class="cursor-pointer text-[11px] text-muted-foreground">
        Researched {research.sources.length}
        {research.sources.length === 1 ? 'source' : 'sources'}
      </summary>
      <ol class="mt-1.5 flex flex-col gap-1">
        {#each research.sources as source (source.n)}
          <li class="text-[10px] leading-relaxed">
            <span class="text-muted-foreground">[{source.n}] {source.origin}</span>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              class="text-slate-700 underline underline-offset-2"
            >
              {source.title}
            </a>
            {#if source.date}<span class="text-muted-foreground"> · {source.date}</span>{/if}
          </li>
        {/each}
      </ol>
    </details>
  {:else}
    <p class="text-[11px] text-muted-foreground">
      No research came back. The angle will lean entirely on your own profile.
    </p>
  {/if}
</section>
