import { captureActiveTabHtml } from '../capture/active-tab-html';
import type { PlaybookDefinition, PlaybookResult } from './playbook';
import { extractJobSections } from './toptal-job-sections';
import { TOPTAL_JOB_PAGE } from './toptal-job-url';

/**
 * The original Workflows action, now one playbook among however many follow.
 *
 * Still thin: `capture/` owns the mechanism (which tabs are injectable, which page a run
 * demands, the character budget, how a refusal is worded). What belongs here is the Toptal
 * knowledge — the URL shape it needs and the sections it reads — and nothing else.
 */
async function run(): Promise<PlaybookResult> {
  const result = await captureActiveTabHtml(TOPTAL_JOB_PAGE);
  if (!result.ok) return result;
  return { ok: true, capture: result.capture, sections: extractJobSections(result.capture.html) };
}

export const toptalPlaybook: PlaybookDefinition = {
  id: 'toptal',
  label: 'Toptal',
  description:
    'Capture reads the Toptal job page you are looking at and shows its sections — the ' +
    'description, the attributes, the questions, the skills and the application form — as ' +
    'text. It runs entirely on your machine — nothing is sent anywhere and nothing is saved.',
  run,
};
