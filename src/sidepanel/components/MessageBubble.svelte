<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { renderMarkdown } from '../markdown';

  interface Props {
    role: 'user' | 'assistant' | 'error';
    content: string;
    isStreaming?: boolean;
    children?: Snippet;
  }

  let { role, content, isStreaming = false, children }: Props = $props();
</script>

<div
  class="flex flex-col gap-1 px-3 py-2 rounded-lg text-sm max-w-[85%] break-words"
  class:ml-auto={role === 'user'}
  class:bg-primary={role === 'user'}
  class:text-primary-foreground={role === 'user'}
  class:bg-muted={role === 'assistant'}
  class:bg-destructive={role === 'error'}
  class:text-destructive-foreground={role === 'error'}
  in:fly={{ y: 8, duration: 150 }}
>
  {#if isStreaming}
    <span class="whitespace-pre-wrap">{content}</span>
  {:else}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <div class="prose prose-sm dark:prose-invert max-w-none">{@html renderMarkdown(content)}</div>
  {/if}
  {@render children?.()}
</div>
