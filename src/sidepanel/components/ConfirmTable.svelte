<script lang="ts">
  import type { FieldFill } from '../../types';
  import { Input } from '$components/ui/input';

  let { fields }: { fields: FieldFill[] } = $props();
</script>

<div class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
  {#each fields as field (field.fieldId)}
    <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      <span class="text-sm font-semibold text-foreground leading-tight">{field.label}</span>
      {#if field.currentValue}
        <span class="text-xs text-muted-foreground">
          Current: <span class="font-medium">{field.currentValue}</span>
        </span>
      {/if}
      <Input
        value={field.editedValue ?? field.proposedValue}
        oninput={(e) => {
          field.editedValue = (e.currentTarget as HTMLInputElement).value;
        }}
        class="h-7 text-sm"
        placeholder="Proposed value…"
      />
    </div>
  {/each}
</div>
