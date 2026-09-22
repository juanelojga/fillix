<script lang="ts">
  import AngleBrief from './AngleBrief.svelte';
  import ComposerFailure from './ComposerFailure.svelte';
  import PostDraft from './PostDraft.svelte';
  import ResearchNotes from './ResearchNotes.svelte';
  import TopicChoices from './TopicChoices.svelte';
  import { composerState } from '../stores/composer';
  import { regenerateBrief } from '../stores/composer-brief';
  import { regenerateDraft } from '../stores/composer-draft';

  let { description }: { description: string } = $props();

  const state = $derived($composerState);
</script>

<div class="flex flex-col">
  {#if state.stage === 'topics'}
    {#if state.status === 'idle'}
      <div class="flex flex-col gap-2 p-4 text-center">
        <p class="text-sm font-medium text-slate-700">No topics yet.</p>
        <p class="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    {:else if state.status === 'running'}
      <TopicChoices topics={[]} />
      <p class="px-3 py-3 text-xs text-muted-foreground">
        Reading your voice spec and pillars — usually 10–20 seconds.
      </p>
    {:else if state.status === 'failed'}
      <TopicChoices topics={[]} />
      <ComposerFailure diagnosis={state.diagnosis} />
    {:else}
      <TopicChoices topics={state.topics} />
    {/if}
  {:else if state.stage === 'brief'}
    <header class="border-b px-3 py-2">
      <h3 class="text-xs font-semibold text-slate-800">{state.topic.title}</h3>
      <p class="text-[11px] text-muted-foreground leading-relaxed">{state.topic.angle}</p>
    </header>

    {#if state.status === 'researching'}
      <p class="px-3 py-3 text-xs text-muted-foreground">
        Searching the web and Hacker News — usually under 15 seconds.
      </p>
    {:else if state.status === 'writing'}
      <ResearchNotes research={state.research} />
      <p class="px-3 py-3 text-xs text-muted-foreground">
        Working out the angle — usually 20–40 seconds.
      </p>
    {:else if state.status === 'failed'}
      {#if state.research}
        <ResearchNotes research={state.research} />
      {/if}
      <ComposerFailure diagnosis={state.diagnosis} />
      <div class="px-3 pb-2">
        <button
          type="button"
          class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
                 hover:bg-accent focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-ring"
          onclick={() => regenerateBrief()}
        >
          Regenerate
        </button>
      </div>
    {:else}
      <AngleBrief
        brief={state.brief}
        research={state.research}
        specifics={state.specifics}
        hook={state.hook}
      />
    {/if}
  {:else}
    <header class="border-b px-3 py-2">
      <h3 class="text-xs font-semibold text-slate-800">{state.topic.title}</h3>
      <p class="text-[11px] text-muted-foreground leading-relaxed">{state.brief.spike}</p>
    </header>

    {#if state.status === 'writing'}
      <p class="px-3 py-3 text-xs text-muted-foreground">
        Writing the post, then checking it against the algorithm rules — usually a minute or two.
      </p>
    {:else if state.status === 'failed'}
      <ComposerFailure diagnosis={state.diagnosis} />
      <div class="px-3 pb-2">
        <button
          type="button"
          class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
                 hover:bg-accent focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-ring"
          onclick={() => regenerateDraft()}
        >
          Regenerate
        </button>
      </div>
    {:else}
      <PostDraft result={state.result} edited={state.edited} report={state.report} />
    {/if}
  {/if}

  <!-- Said once, on screen, rather than left for the user to discover by looking for a button
       that is not there. LinkedIn's composer is a Quill contenteditable and `writeFields` sets
       `value` on inputs and textareas, so a fill would either do nothing or corrupt the
       editor's own model — and a silently failed fill is worse than a paste. -->
  <p class="border-t px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
    Finished posts are copied, never typed into LinkedIn for you.
  </p>
</div>
