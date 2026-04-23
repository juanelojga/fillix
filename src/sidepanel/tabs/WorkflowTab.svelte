<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { AgentPortOut } from '../../lib/agent-runner';
  import {
    workflowList,
    pipelineStages,
    confirmFields,
    isAgentRunning,
    loadWorkflows,
    startRun,
    handleStageUpdate,
    applyFields,
    cancelRun,
  } from '../stores/workflow';
  import { Button } from '$components/ui/button';
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
  } from '$components/ui/tooltip';
  import PipelineStages from '../components/PipelineStages.svelte';
  import ConfirmTable from '../components/ConfirmTable.svelte';

  const workflowPort = getContext<chrome.runtime.Port>('workflowPort');

  let selectedWorkflowId = $state('');
  let activeTabId = $state(0);
  let completionMessage = $state('');
  let localConfirmFields = $state($confirmFields);

  $effect(() => {
    localConfirmFields = [...$confirmFields];
  });

  onMount(async () => {
    await loadWorkflows();

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) activeTabId = tabs[0].id;

    workflowPort.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as AgentPortOut;
      switch (msg.type) {
        case 'AGENTIC_STAGE':
          handleStageUpdate(msg);
          break;
        case 'AGENTIC_PLAN_REVIEW':
        case 'AGENTIC_FILLS_REVIEW':
          // handled in Sprint 5 (thread UI)
          break;
        case 'AGENTIC_SUMMARY':
          isAgentRunning.set(false);
          completionMessage = `Applied ${msg.applied} field(s).`;
          break;
        case 'AGENTIC_ERROR':
          handleStageUpdate({
            type: 'AGENTIC_STAGE',
            stage: msg.stage,
            status: 'error',
            summary: msg.error,
          });
          isAgentRunning.set(false);
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
    completionMessage = '';
    startRun(selectedWorkflowId, activeTabId, workflowPort);
  }

  function handleApply() {
    applyFields(localConfirmFields, activeTabId, workflowPort);
  }

  function handleCancel() {
    cancelRun(workflowPort);
    completionMessage = '';
  }
</script>

<TooltipProvider>
  <div class="flex flex-col h-full gap-3 p-3 overflow-y-auto">
    <!-- Workflow selector + Run + Refresh -->
    <div class="flex gap-2 items-center">
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

    <!-- Pipeline stages — shown when running or any stage has data -->
    {#if $isAgentRunning || $pipelineStages.some((s) => s.status !== 'idle')}
      <div class="rounded-xl border border-border bg-muted/30 p-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pipeline</p>
        <PipelineStages stages={$pipelineStages} />
      </div>
    {/if}

    <!-- Completion message -->
    {#if completionMessage}
      <div class="rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20 px-3 py-2 text-sm text-success font-medium">
        {completionMessage}
      </div>
    {/if}

    <!-- Confirm fields + Apply/Cancel — shown only when confirming -->
    {#if localConfirmFields.length > 0}
      <div class="rounded-xl border border-border bg-muted/30 p-3 flex flex-col gap-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review & Edit</p>
        <ConfirmTable fields={localConfirmFields} />
        <div class="flex flex-col gap-2">
          <Button
            onclick={handleApply}
            class="w-full bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] hover:bg-[hsl(var(--success))]/90 border-transparent"
          >
            Apply
          </Button>
          <Button variant="destructive" onclick={handleCancel} class="w-full">Cancel</Button>
        </div>
      </div>
    {/if}
  </div>
</TooltipProvider>
