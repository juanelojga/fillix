<script lang="ts">
  interface Props {
    toolName: string;
    args: Record<string, string>;
    result: string | null;
  }

  let { toolName, args, result }: Props = $props();

  const primaryArg = $derived(Object.values(args)[0] ?? '');
</script>

<details class="text-xs border border-border rounded px-2 py-1 mt-1">
  <summary class="cursor-pointer text-muted-foreground select-none">
    ⚙ {toolName}{primaryArg ? `: ${primaryArg}` : ''}
  </summary>
  <ul class="mt-1 space-y-0.5">
    {#each Object.entries(args) as [key, value]}
      <li><span class="font-medium">{key}:</span> {value}</li>
    {/each}
  </ul>
  {#if result !== null}
    <div class="mt-1 pt-1 border-t border-border text-muted-foreground whitespace-pre-wrap">
      {result}
    </div>
  {/if}
</details>
