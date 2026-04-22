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
    handleConfirm,
    applyFields,
    cancelRun,
  } from '../stores/agent';
  import { Button } from '$components/ui/button';
  import PipelineStages from '../components/PipelineStages.svelte';
  import ConfirmTable from '../components/ConfirmTable.svelte';

  const agentPort = getContext<chrome.runtime.Port>('agentPort');

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

    agentPort.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as AgentPortOut;
      switch (msg.type) {
        case 'AGENTIC_STAGE':
          handleStageUpdate(msg);
          break;
        case 'AGENTIC_CONFIRM':
          handleConfirm(msg);
          break;
        case 'AGENTIC_COMPLETE':
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
    startRun(selectedWorkflowId, activeTabId, agentPort);
  }

  function handleApply() {
    applyFields(localConfirmFields, activeTabId, agentPort);
  }

  function handleCancel() {
    cancelRun(agentPort);
    completionMessage = '';
  }
</script>

<div class="flex flex-col h-full gap-3 p-3 overflow-y-auto">
  <!-- Workflow selector + Run -->
  <div class="flex gap-2 items-center">
    <select
      class="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      bind:value={selectedWorkflowId}
      disabled={$isAgentRunning}
    >
      <option value="" disabled>Select workflow…</option>
      {#each $workflowList as workflow (workflow.id)}
        <option value={workflow.id}>{workflow.name}</option>
      {/each}
    </select>

    <Button onclick={handleRun} disabled={!selectedWorkflowId || $isAgentRunning || activeTabId === 0} class="shrink-0">
      Run
    </Button>
  </div>

  <!-- Pipeline stages — shown when running or any stage has data -->
  {#if $isAgentRunning || $pipelineStages.some((s) => s.status !== 'idle')}
    <PipelineStages stages={$pipelineStages} />
  {/if}

  <!-- Completion message -->
  {#if completionMessage}
    <p class="text-sm text-green-600">{completionMessage}</p>
  {/if}

  <!-- Confirm table + Apply/Cancel — shown only when confirming -->
  {#if localConfirmFields.length > 0}
    <ConfirmTable fields={localConfirmFields} />

    <div class="flex flex-col gap-2 mt-1">
      <Button onclick={handleApply} class="w-full">Apply</Button>
      <Button variant="ghost" onclick={handleCancel} class="w-full">Cancel</Button>
    </div>
  {/if}
</div>
