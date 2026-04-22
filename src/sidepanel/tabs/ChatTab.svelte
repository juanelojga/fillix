<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { messages, streamingState, activeMessage } from '../stores/chat';
  import { providerConfig } from '../stores/settings';
  import type { PortMessage } from '../../types';
  import MessageBubble from '../components/MessageBubble.svelte';
  import ToolCallBlock from '../components/ToolCallBlock.svelte';
  import ThinkingBlock from '../components/ThinkingBlock.svelte';

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

<div class="flex flex-col h-full bg-background">
  <!-- Header: New conversation button -->
  <div class="flex items-center justify-end px-3 py-2 border-b border-border/50">
    <button
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 active:scale-95"
      onclick={newConversation}
      title="New conversation"
      aria-label="New conversation"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      New chat
    </button>
  </div>

  <!-- Message list -->
  <div
    bind:this={viewportRef}
    class="flex-1 overflow-y-auto min-h-0"
    role="log"
    aria-label="Chat messages"
  >
    {#if $messages.length === 0 && $activeMessage === null}
      <div class="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
          </svg>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">How can I help you today?</p>
      </div>
    {:else}
      <div class="flex flex-col py-3 gap-0.5">
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
    {/if}
  </div>

  <!-- Input area -->
  <div class="p-3">
    <div class="relative rounded-2xl border border-input bg-background shadow-sm focus-within:border-ring/50 focus-within:shadow-md transition-all duration-200">
      <textarea
        bind:this={textareaEl}
        bind:value={inputText}
        rows={1}
        placeholder="Message Fillix…"
        class="w-full resize-none bg-transparent px-4 pt-3 pb-3 pr-14 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none overflow-hidden"
        aria-label="Message input"
        onkeydown={handleKeydown}
        oninput={handleInput}
      ></textarea>

      <div class="absolute bottom-2.5 right-2.5">
        {#if $streamingState === 'streaming'}
          <button
            class="flex items-center justify-center w-8 h-8 rounded-xl bg-foreground text-background hover:opacity-80 active:scale-95 transition-all duration-100"
            onclick={stop}
            aria-label="Stop generating"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2"/>
            </svg>
          </button>
        {:else}
          <button
            class="flex items-center justify-center w-8 h-8 rounded-xl bg-foreground text-background hover:opacity-80 active:scale-95 transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed disabled:active:scale-100"
            onclick={send}
            disabled={!inputText.trim()}
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
    <p class="text-center text-[10px] text-muted-foreground/40 mt-1.5">Enter to send · Shift+Enter for new line</p>
  </div>
</div>
