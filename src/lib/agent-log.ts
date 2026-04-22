import type { PipelineStage, WorkflowDefinition } from '../types';

export const REDACT_PATTERN =
  /\b(?:password|token|secret|key|bearer)\s*[:=]\s*\S+|\bBearer\s+\S+|(?<=\w+_(?:password|token|secret|key|bearer)\s*[:=]\s*)\S+/gi;

export function redact(text: string): string {
  return text.replace(REDACT_PATTERN, '[REDACTED]');
}

export function buildRunHeader(workflow: WorkflowDefinition, url: string): string {
  return `## Run — ${new Date().toISOString()}\n**Workflow:** ${workflow.name}\n**Page:** ${url}`;
}

export function buildStageEntry(
  stage: PipelineStage,
  durationMs: number,
  summary: string,
  fullOutput?: string,
  logFullOutput?: boolean,
): string {
  let entry = `\n\n### Stage: ${stage} (${durationMs}ms)\n${summary}`;
  if (logFullOutput && fullOutput) {
    entry += `\n\n<details><summary>Full output</summary>\n\n\`\`\`json\n${redact(fullOutput)}\n\`\`\`\n\n</details>`;
  }
  return entry;
}
