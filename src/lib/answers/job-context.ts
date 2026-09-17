import { missingRequiredSkills, type JobBrief } from '../playbooks/job-brief';

/**
 * What the model is told about the job.
 *
 * Budgeted, and deliberately not "the whole posting": a local model's context has to hold this
 * plus the profile excerpts plus the question, and the description is the only part of a brief
 * that runs to thousands of characters. What the attributes and the skill split cost is tiny
 * and what they carry — the hours, the overlap, and which required skills the applicant does
 * not claim — is what the answers actually turn on.
 */

/** Roughly a thousand tokens. The rest of the budget belongs to the applicant's own words. */
export const JOB_CONTEXT_CHARS = 4_000;

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  // Cut at a line break so the model is never handed half a sentence to complete.
  const cut = text.lastIndexOf('\n', limit);
  return `${text.slice(0, cut > limit / 2 ? cut : limit).trim()}\n…`;
}

export function buildJobContext(brief: JobBrief, limit: number = JOB_CONTEXT_CHARS): string {
  const parts: string[] = [];

  const attributes = Object.entries(brief.attributes);
  if (attributes.length > 0) {
    parts.push(attributes.map(([label, value]) => `${label}: ${value}`).join('\n'));
  }

  const claimed = brief.skills.required.filter((s) => s.onProfile).map((s) => s.name);
  if (claimed.length > 0) parts.push(`Required skills you already list: ${claimed.join(', ')}`);

  // Named explicitly rather than left to be inferred from an absence. The model is being asked
  // not to claim these, and "not mentioned in the excerpts" is a much weaker instruction than
  // a list with a heading on it.
  const missing = missingRequiredSkills(brief);
  if (missing.length > 0) {
    parts.push(
      `Required skills you do NOT list — never imply experience with these: ${missing.join(', ')}`,
    );
  }

  const fixed = parts.join('\n\n');
  if (!brief.description) return fixed;

  const room = limit - fixed.length - 'Job description:\n\n'.length;
  const description = truncate(brief.description, Math.max(room, 500));
  return fixed
    ? `${fixed}\n\nJob description:\n${description}`
    : `Job description:\n${description}`;
}
