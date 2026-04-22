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

{#if role === 'user'}
  <div class="flex justify-end px-4 py-1.5" in:fly={{ y: 6, duration: 150 }}>
    <div class="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm break-words whitespace-pre-wrap leading-relaxed shadow-sm">
      {content}
    </div>
  </div>
{:else}
  <div class="flex gap-2.5 px-4 py-1.5" in:fly={{ y: 6, duration: 150 }}>
    <div class="flex-shrink-0 w-6 h-6 mt-0.5 rounded-full bg-muted flex items-center justify-center">
      {#if role === 'error'}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="text-destructive">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-foreground/50">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
        </svg>
      {/if}
    </div>

    <div class="flex-1 min-w-0 pt-0.5">
      {#if isStreaming}
        {#if content}
          <span class="text-sm whitespace-pre-wrap break-words leading-relaxed">{content}</span>
        {:else}
          <span class="inline-flex gap-1 items-center h-5">
            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 0ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 300ms"></span>
          </span>
        {/if}
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div
          class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
          class:text-destructive={role === 'error'}
        >{@html renderMarkdown(content)}</div>
      {/if}
      {@render children?.()}
    </div>
  </div>
{/if}
