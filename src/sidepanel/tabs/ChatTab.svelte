<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { messages, streamingState, activeMessage } from '../stores/chat';
  import { providerConfig } from '../stores/settings';
  import type { PortMessage } from '../../types';
  import MessageBubble from '../components/MessageBubble.svelte';
  import ToolCallBlock from '../components/ToolCallBlock.svelte';
  import ThinkingBlock from '../components/ThinkingBlock.svelte';
  import { ScrollArea } from '$components/ui/scroll-area';

  const chatPort = getContext<chrome.runtime.Port>('chatPort');

  let inputText = $state('');
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let sentinelEl: HTMLDivElement | null = $state(null);
  let viewportRef: HTMLElement | null = $state(null);
  let isUserScrolled = $state(false);

  // Composite trigger so $effect reads both stores as reactive deps
  let scrollTrigger = $derived($messages.length + ($activeMessage ? 1 : 0));

  $effect(() => {
    if (scrollTrigger >= 0 && !isUserScrolled && sentinelEl) {
      sentinelEl.scrollIntoView({ block: 'end' });
    }
  });

  // Track whether the user has scrolled away from the bottom
  $effect(() => {
    if (!viewportRef) return;
    const viewport = viewportRef;
    function onScroll() {
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 10;
      isUserScrolled = !atBottom;
    }
    viewport.addEventListener('scroll', onScroll);
    return () => viewport.removeEventListener('scroll', onScroll);
  });

  onMount(() => {
    chatPort.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as PortMessage;
      switch (msg.type) {
        case 'token':
          activeMessage.update((m) => (m ? { ...m, content: m.content + msg.value } : m));
          break;
        case 'thinking':
          activeMessage.update((m) => (m ? { ...m, thinking: m.thinking + msg.value } : m));
          break;
        case 'tool-call':
          activeMessage.update((m) =>
            m
              ? {
                  ...m,
                  toolCalls: [
                    ...m.toolCalls,
                    { toolName: msg.toolName, args: msg.args, result: null },
                  ],
                }
              : m,
          );
          break;
        case 'tool-result':
          activeMessage.update((m) =>
            m
              ? {
                  ...m,
                  toolCalls: m.toolCalls.map((tc) =>
                    tc.toolName === msg.toolName ? { ...tc, result: msg.result } : tc,
                  ),
                }
              : m,
          );
          break;
        case 'done': {
          const current = get(activeMessage);
          activeMessage.set(null);
          if (current) {
            messages.update((ms) => [...ms, { role: 'assistant', content: current.content }]);
          }
          streamingState.set('idle');
          break;
        }
        case 'error':
          activeMessage.set(null);
          messages.update((ms) => [
            ...ms,
            { role: 'assistant', content: `Error: ${msg.error}` },
          ]);
          streamingState.set('idle');
          break;
        default: {
          const _never: never = msg;
          throw new Error(`Unhandled port message: ${JSON.stringify(_never)}`);
        }
      }
    });
  });

  function send() {
    const text = inputText.trim();
    if (!text || $streamingState === 'streaming') return;
    messages.update((ms) => [...ms, { role: 'user', content: text }]);
    activeMessage.set({ content: '', thinking: '', toolCalls: [] });
    streamingState.set('streaming');
    inputText = '';
    isUserScrolled = false;
    chatPort.postMessage({
      type: 'CHAT_START',
      messages: $messages,
      systemPrompt: '',
      model: $providerConfig?.model,
      provider: $providerConfig?.provider,
    });
  }

  function stop() {
    chatPort.postMessage({ type: 'CHAT_STOP' });
    streamingState.set('idle');
  }

  function newConversation() {
    messages.set([]);
    activeMessage.set(null);
    streamingState.set('idle');
    isUserScrolled = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(textareaEl).lineHeight) || 20;
    const maxHeight = lineHeight * 6;
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, maxHeight)}px`;
    textareaEl.style.overflowY = textareaEl.scrollHeight > maxHeight ? 'scroll' : 'hidden';
  }
</script>

<div class="flex flex-col h-full">
  <!-- Message list -->
  <ScrollArea
    class="flex-1"
    bind:viewportRef
    role="log"
    aria-label="Chat messages"
  >
    <div class="flex flex-col gap-2 p-3">
      {#each $messages as msg}
        <MessageBubble role={msg.role} content={msg.content} />
      {/each}

      {#if $activeMessage !== null}
        <MessageBubble role="assistant" content={$activeMessage.content} isStreaming={true}>
          {#if $activeMessage.thinking}
            <ThinkingBlock
              content={$activeMessage.thinking}
              isStreaming={$streamingState === 'streaming'}
            />
          {/if}
          {#each $activeMessage.toolCalls as toolCall (toolCall.toolName)}
            <ToolCallBlock toolName={toolCall.toolName} args={toolCall.args} result={toolCall.result} />
          {/each}
        </MessageBubble>
      {/if}

      <div bind:this={sentinelEl} aria-hidden="true"></div>
    </div>
  </ScrollArea>

  <!-- Controls -->
  <div class="border-t border-border p-2 flex flex-col gap-1">
    <div class="flex gap-1 items-end">
      <textarea
        bind:this={textareaEl}
        bind:value={inputText}
        rows={1}
        placeholder="Message…"
        class="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring overflow-hidden"
        aria-label="Message input"
        onkeydown={handleKeydown}
        oninput={handleInput}
      ></textarea>
      {#if $streamingState === 'streaming'}
        <button
          class="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium"
          onclick={stop}
          aria-label="Stop"
        >
          Stop
        </button>
      {:else}
        <button
          class="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          onclick={send}
          disabled={!inputText.trim()}
          aria-label="Send"
        >
          Send
        </button>
      {/if}
    </div>
    <button
      class="text-xs text-muted-foreground hover:text-foreground self-start"
      onclick={newConversation}
    >
      New conversation
    </button>
  </div>
</div>
