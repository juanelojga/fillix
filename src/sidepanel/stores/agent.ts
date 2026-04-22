import { writable } from 'svelte/store';
import type { FieldFill, PipelineStage, WorkflowDefinition } from '../../types';

export type StageStatus = 'idle' | 'running' | 'done' | 'error';

export interface PipelineStageState {
  stage: PipelineStage;
  status: StageStatus;
  durationMs?: number;
  summary?: string;
  error?: string;
}

export const workflowList = writable<WorkflowDefinition[]>([]);
export const pipelineStages = writable<PipelineStageState[]>([]);
export const confirmFields = writable<FieldFill[]>([]);
export const isAgentRunning = writable(false);
