<script lang="ts">
  import type { AgentThreadMessage } from '../../types';

  let { message }: { message: AgentThreadMessage } = $props();

  function formatMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }
</script>

{#if message.kind === 'plan-review'}
  <div class="rounded-xl border border-border bg-muted/40 p-3 text-sm">
    <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      Plan — review & approve
    </p>
    <div class="space-y-1">
      <p><span class="font-medium">Tone:</span> {message.plan.tone}</p>
      {#if message.plan.fields_to_fill.length > 0}
        <p class="font-medium mt-2">Fields to fill:</p>
        <ul class="list-disc pl-4 space-y-0.5">
          {#each message.plan.fields_to_fill as field (field.field_id)}
            <li><span class="font-mono text-xs">{field.field_id}</span> — {field.strategy}</li>
          {/each}
        </ul>
      {/if}
      {#if message.plan.missing_fields.length > 0}
        <p class="font-medium mt-2 text-amber-600 dark:text-amber-400">Missing:</p>
        <ul class="list-disc pl-4 space-y-0.5 text-amber-600 dark:text-amber-400">
          {#each message.plan.missing_fields as f (f)}
            <li>{f}</li>
          {/each}
        </ul>
      {/if}
      {#if message.plan.notes}
        <p class="mt-1 text-muted-foreground text-xs">{message.plan.notes}</p>
      {/if}
    </div>
  </div>

{:else if message.kind === 'fills-review'}
  <div class="rounded-xl border border-border bg-muted/40 p-3 text-sm">
    <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {message.subKind === 'reply' ? 'Reply — review & approve' : 'Draft values — review & approve'}
    </p>
    {#if message.subKind === 'reply'}
      <p class="whitespace-pre-wrap text-sm">{message.replyText}</p>
    {:else}
      <ul class="space-y-2">
        {#each message.fills as fill (fill.fieldId)}
          <li class="flex flex-col gap-0.5">
            <span class="text-xs text-muted-foreground">{fill.label || fill.fieldId}</span>
            <span class="rounded bg-background border border-border px-2 py-1 text-xs font-mono">
              {fill.proposedValue}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

{:else if message.kind === 'user-feedback'}
  <div class="self-end rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm max-w-[85%]">
    {message.text}
  </div>

{:else if message.kind === 'summary'}
  <div class="rounded-xl border border-border bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/20 p-3 text-sm">
    <p class="font-medium text-success">
      Done — {message.applied} applied, {message.skipped} skipped
      {#if message.wordCount !== undefined}· {message.wordCount} words{/if}
    </p>
    <p class="text-xs text-muted-foreground mt-0.5">{formatMs(message.durationMs)}</p>
  </div>

{:else if message.kind === 'error'}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
    <p class="font-medium">Error</p>
    <p class="text-xs mt-0.5">{message.error}</p>
  </div>
{/if}
