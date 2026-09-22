<script lang="ts">
  import HookVariants from './HookVariants.svelte';
  import ResearchNotes from './ResearchNotes.svelte';
  import { Badge } from '$components/ui/badge';
  import { diagnoseRetrievalFailure } from '$lib/profile/retrieval-diagnostics';
  import { PILLAR_LABEL } from '$lib/linkedin/post-taxonomy';
  import type { PostSpecifics } from '$lib/linkedin/post-specifics';
  import type { AngleBrief } from '$lib/linkedin/write-brief';
  import type { TopicResearch } from '$lib/linkedin/topic-research';
  import { regenerateBrief } from '../stores/composer-brief';
  import { writeDraft } from '../stores/composer-draft';

  let {
    brief,
    research,
    specifics,
    hook,
  }: {
    brief: AngleBrief;
    research: TopicResearch;
    specifics: PostSpecifics;
    hook: number;
  } = $props();

  const profileGap = $derived(specifics.failure ? diagnoseRetrievalFailure(specifics.failure) : null);
</script>

<ResearchNotes {research} />

<section class="border-b px-3 py-2">
  <h3 class="text-xs font-semibold text-slate-800">Angle</h3>
  <div class="mt-1 flex flex-wrap gap-1">
    <Badge class="text-[10px] uppercase">{PILLAR_LABEL[brief.pillar]}</Badge>
    <Badge class="text-[10px] uppercase">{brief.style}</Badge>
    <Badge class="text-[10px] uppercase">{brief.funnel}</Badge>
    <Badge class="text-[10px] uppercase">{brief.icp}</Badge>
  </div>
  <p class="mt-1.5 text-[11px] leading-relaxed text-slate-800">{brief.spike}</p>

  {#if specifics.headings.length > 0}
    <!-- The citation is the point, as it is on AnswerCard: it makes a claim checkable in one
         glance instead of requiring the whole profile to be re-read. -->
    <p class="mt-1.5 text-[10px] text-muted-foreground">
      Drew on: {specifics.headings.join(' · ')}
    </p>
  {:else if profileGap}
    <!-- A missing index does not stop the post, but it does change how it reads — and the
         button that fixes it is on another tab, so the hint has to name it. -->
    <div class="mt-1.5 flex flex-col gap-0.5">
      <span
        class="w-fit rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]
               font-medium text-amber-900"
      >
        {profileGap.summary}
      </span>
      <p class="text-[10px] text-muted-foreground leading-relaxed">{profileGap.hint}</p>
    </div>
  {:else}
    <p class="mt-1.5 text-[10px] text-muted-foreground">
      Your profile had no section matching this topic, so the angle leans on the research alone.
    </p>
  {/if}
</section>

<HookVariants hooks={brief.hooks} selected={hook} />

<div class="flex items-center gap-2 px-3 py-2">
  <!-- Not "Capture": every hint in capture-diagnostics.ts tells the user to press Capture
       again, and those stay true only while exactly one button carries that name. -->
  <button
    type="button"
    class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
           hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onclick={() => writeDraft()}
  >
    Write the post
  </button>
  <button
    type="button"
    class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
           hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onclick={() => regenerateBrief()}
  >
    Regenerate
  </button>
</div>
