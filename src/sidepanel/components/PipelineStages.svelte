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
</script>

<ol class="flex flex-col gap-1">
  {#each ALL_STAGES as stageName (stageName)}
    {@const stage = getStage(stageName)}
    <li class="flex items-start gap-2 py-1">
      <span class="mt-0.5 w-4 shrink-0 text-center text-sm">
        {#if stage.status === 'idle'}
          <span class="text-muted-foreground">·</span>
        {:else if stage.status === 'running'}
          <span class="animate-spin inline-block">⟳</span>
        {:else if stage.status === 'done'}
          <span class="text-success">✓</span>
        {:else if stage.status === 'error'}
          <span class="text-destructive">✗</span>
        {/if}
      </span>

      <div class="flex flex-col gap-0.5 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">{STAGE_LABELS[stageName]}</span>
          <Badge
            variant={stage.status === 'idle'
              ? 'secondary'
              : stage.status === 'running'
                ? 'outline'
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
        {#if stage.summary}
          <p class="text-xs text-muted-foreground truncate">{stage.summary}</p>
        {/if}
        {#if stage.status === 'error' && (stage.error || stage.summary)}
          <p class="text-xs text-destructive">{stage.error ?? stage.summary}</p>
        {/if}
      </div>
    </li>
  {/each}
</ol>
