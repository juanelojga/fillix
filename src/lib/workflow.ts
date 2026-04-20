import { load } from 'js-yaml';
import type { WorkflowDefinition } from '../types';

export function parseWorkflow(vaultPath: string, raw: string): WorkflowDefinition {
  const parts = raw.split(/^---$/m);
  if (parts.length < 3) {
    throw new Error(`No YAML frontmatter found in ${vaultPath}`);
  }

  const frontmatter = load(parts[1]) as Record<string, unknown>;
  const body = parts.slice(2).join('---').trim();

  if (!frontmatter || typeof frontmatter.name !== 'string' || !frontmatter.name) {
    throw new Error(`Workflow at ${vaultPath} is missing required field: name`);
  }

  const VALID_TASK_TYPES = new Set<WorkflowDefinition['taskType']>([
    'form',
    'field-by-field',
    'linkedin-post',
    'rewrite',
  ]);
  const rawTaskType = frontmatter.task_type;
  const taskType: WorkflowDefinition['taskType'] =
    typeof rawTaskType === 'string' &&
    VALID_TASK_TYPES.has(rawTaskType as WorkflowDefinition['taskType'])
      ? (rawTaskType as WorkflowDefinition['taskType'])
      : 'form';

  return {
    id: vaultPath,
    name: String(frontmatter.name),
    taskType,
    tone: frontmatter.tone ? String(frontmatter.tone) : 'professional',
    requiredProfileFields: Array.isArray(frontmatter.required_profile_fields)
      ? (frontmatter.required_profile_fields as unknown[]).map(String)
      : [],
    review: frontmatter.review !== undefined ? Boolean(frontmatter.review) : true,
    logFullOutput:
      frontmatter.log_full_output !== undefined ? Boolean(frontmatter.log_full_output) : true,
    autoApply: frontmatter.auto_apply !== undefined ? Boolean(frontmatter.auto_apply) : false,
    systemPrompt: body,
  };
}
