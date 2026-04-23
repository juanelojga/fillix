<script lang="ts">
  import { getContext, onMount, tick } from 'svelte';
  import type { AgentPortIn, AgentPortOut } from '../../lib/agent-runner';
  import {
    workflowList,
    isAgentRunning,
    agentMessages,
    pendingGate,
    loadWorkflows,
    startRun,
    addMessage,
    setPendingGate,
    cancelRun,
  } from '../stores/workflow';
  import { Button } from '$components/ui/button';
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
  } from '$components/ui/tooltip';
  import WorkflowMessage from '../components/WorkflowMessage.svelte';

  const workflowPort = getContext<chrome.runtime.Port>('workflowPort');

  let selectedWorkflowId = $state('');
  let activeTabId = $state(0);
  let feedbackText = $state('');
  let threadEl = $state<HTMLDivElement | null>(null);

  async function scrollToBottom() {
    await tick();
    threadEl?.scrollTo({ top: threadEl.scrollHeight, behavior: 'smooth' });
  }

  onMount(async () => {
    await loadWorkflows();

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) activeTabId = tabs[0].id;

    workflowPort.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as AgentPortOut;
      switch (msg.type) {
        case 'AGENTIC_STAGE':
          // loading indicator handled via isAgentRunning; no thread bubble needed
          break;
        case 'AGENTIC_PLAN_REVIEW':
          addMessage({ kind: 'plan-review', plan: msg.plan });
          setPendingGate('plan');
          void scrollToBottom();
          break;
        case 'AGENTIC_FILLS_REVIEW':
          if (msg.kind === 'form') {
            addMessage({ kind: 'fills-review', fills: msg.fills });
          }
          setPendingGate('fills');
          void scrollToBottom();
          break;
        case 'AGENTIC_SUMMARY':
          addMessage({
            kind: 'summary',
            applied: msg.applied,
            skipped: msg.skipped,
            durationMs: msg.durationMs,
            ...(msg.wordCount !== undefined ? { wordCount: msg.wordCount } : {}),
          });
          setPendingGate(null);
          isAgentRunning.set(false);
          void scrollToBottom();
          break;
        case 'AGENTIC_ERROR':
          addMessage({ kind: 'error', stage: msg.stage, error: msg.error });
          setPendingGate(null);
          isAgentRunning.set(false);
          void scrollToBottom();
          break;
        default: {
          const _never: never = msg;
          throw new Error(`Unhandled agent port message: ${JSON.stringify(_never)}`);
        }
      }
    });
  });

  function handleRun() {
    if (!selectedWorkflowId || $isAgentRunning) return;
    startRun(selectedWorkflowId, activeTabId, workflowPort);
  }

  function handleApprove() {
    if ($pendingGate === null) return;
    const type = $pendingGate === 'plan' ? 'AGENTIC_PLAN_FEEDBACK' : 'AGENTIC_FILLS_FEEDBACK';
    const msg: AgentPortIn = { type, approved: true };
    workflowPort.postMessage(msg);
    setPendingGate(null);
  }

  function handleFeedback() {
    const text = feedbackText.trim();
    if (!text || $pendingGate === null) return;
    addMessage({ kind: 'user-feedback', text });
    feedbackText = '';
    const type = $pendingGate === 'plan' ? 'AGENTIC_PLAN_FEEDBACK' : 'AGENTIC_FILLS_FEEDBACK';
    const msg: AgentPortIn = { type, approved: false, feedback: text };
    workflowPort.postMessage(msg);
    setPendingGate(null);
    void scrollToBottom();
  }

  function handleFeedbackKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFeedback();
    }
  }

  function handleCancel() {
    cancelRun(workflowPort);
  }
</script>

<TooltipProvider>
  <div class="flex flex-col h-full gap-3 p-3">
    <!-- Workflow selector + Run + Refresh -->
    <div class="flex gap-2 items-center shrink-0">
      <select
        aria-label="Select workflow"
        class="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        bind:value={selectedWorkflowId}
        disabled={$isAgentRunning}
      >
        <option value="" disabled>Select workflow…</option>
        {#each $workflowList as workflow (workflow.id)}
          <option value={workflow.id}>{workflow.name}</option>
        {/each}
      </select>

      <Tooltip>
        <TooltipTrigger
          aria-label="Refresh workflows"
          class="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          onclick={loadWorkflows}
          disabled={$isAgentRunning}
        >
          ↻
        </TooltipTrigger>
        <TooltipContent>Refresh workflows</TooltipContent>
      </Tooltip>

      <Button
        onclick={handleRun}
        disabled={!selectedWorkflowId || $isAgentRunning || activeTabId === 0}
        size="lg"
        class="shrink-0"
      >
        Run
      </Button>
    </div>

    <!-- Message thread -->
    <div
      bind:this={threadEl}
      class="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0"
    >
      {#each $agentMessages as msg, i (i)}
        <WorkflowMessage message={msg} />
      {/each}

      {#if $isAgentRunning && $pendingGate === null}
        <div class="text-xs text-muted-foreground animate-pulse px-1">Processing…</div>
      {/if}
    </div>

    <!-- Feedback input — shown only when gate is pending -->
    {#if $pendingGate !== null}
      <div class="shrink-0 flex flex-col gap-2 border-t border-border pt-3">
        <textarea
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows="2"
          placeholder="Type feedback (Enter to send) or click Approve…"
          bind:value={feedbackText}
          onkeydown={handleFeedbackKeydown}
        ></textarea>
        <div class="flex gap-2">
          <Button onclick={handleFeedback} variant="outline" class="flex-1" disabled={!feedbackText.trim()}>
            Send feedback
          </Button>
          <Button onclick={handleApprove} class="flex-1 bg-success text-success-foreground hover:bg-success/90">
            Approve
          </Button>
        </div>
      </div>
    {/if}

    <!-- Cancel — shown while running -->
    {#if $isAgentRunning}
      <div class="shrink-0">
        <Button variant="destructive" onclick={handleCancel} class="w-full">Cancel</Button>
      </div>
    {/if}
  </div>
</TooltipProvider>
