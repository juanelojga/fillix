<script lang="ts">
  interface Props {
    content: string;
    isStreaming?: boolean;
  }

  let { content, isStreaming = false }: Props = $props();
</script>

<details class="text-xs border-l-2 border-muted-foreground/30 pl-2 mt-1">
  <summary class="cursor-pointer text-muted-foreground/70 italic select-none">
    {isStreaming ? 'Thinking…' : 'Thought process'}
  </summary>
  <p class="mt-1 text-muted-foreground/70 whitespace-pre-wrap">{content}</p>
</details>
