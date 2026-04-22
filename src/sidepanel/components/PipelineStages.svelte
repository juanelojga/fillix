<script lang="ts">
  import type { PipelineStageState } from '../stores/agent';
  import type { PipelineStage } from '../../types';
  import { Badge } from '$components/ui/badge';

  let { stages }: { stages: PipelineStageState[] } = $props();

  const ALL_STAGES: PipelineStage[] = ['collect', 'understand', 'plan', 'draft', 'review'];

  const STAGE_LABELS: Record<PipelineStage, string> = {
    collect: 'Collect',
    understand: 'Understand',
    plan: 'Plan',
    draft: 'Draft',
    review: 'Review',
  };

  function getStage(name: PipelineStage): PipelineStageState {
    return stages.find((s) => s.stage === name) ?? { stage: name, status: 'idle' };
  }

  function formatDuration(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
  }

  function rowClass(status: PipelineStageState['status']): string {
    if (status === 'running') return 'bg-primary/5 border border-primary/20 rounded-md px-2';
    if (status === 'done') return 'bg-success/5 rounded-md px-2';
    if (status === 'error') return 'bg-destructive/5 rounded-md px-2';
    return 'px-2';
  }
</script>

<ol class="flex flex-col gap-1">
  {#each ALL_STAGES as stageName (stageName)}
    {@const stage = getStage(stageName)}
    <li class="flex items-start gap-2.5 py-1.5 transition-colors {rowClass(stage.status)}">
      <span class="mt-1.5 shrink-0 flex items-center justify-center">
        {#if stage.status === 'idle'}
          <span class="size-2 rounded-full bg-muted-foreground/30"></span>
        {:else if stage.status === 'running'}
          <span class="size-2 rounded-full bg-primary animate-pulse"></span>
        {:else if stage.status === 'done'}
          <span class="size-2 rounded-full bg-[hsl(var(--success))]"></span>
        {:else if stage.status === 'error'}
          <span class="size-2 rounded-full bg-destructive"></span>
        {/if}
      </span>

      <div class="flex flex-col gap-0.5 min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold">{STAGE_LABELS[stageName]}</span>
          <Badge
            variant={stage.status === 'idle'
              ? 'secondary'
              : stage.status === 'running'
                ? 'secondary'
                : stage.status === 'done'
                  ? 'default'
                  : 'destructive'}
            class="text-xs"
          >
            {stage.status === 'running' ? 'running…' : stage.status}
          </Badge>
          {#if stage.status === 'done' && stage.durationMs !== undefined}
            <span class="text-xs text-muted-foreground">{formatDuration(stage.durationMs)}</span>
          {/if}
        </div>
        {#if stage.summary && stage.status !== 'error'}
          <p class="text-xs text-muted-foreground truncate">{stage.summary}</p>
        {/if}
        {#if stage.status === 'error' && (stage.error || stage.summary)}
          <p class="text-xs text-destructive">{stage.error ?? stage.summary}</p>
        {/if}
      </div>
    </li>
  {/each}
</ol>
