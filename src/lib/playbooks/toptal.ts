import { captureActiveTabHtml } from '../capture/active-tab-html';
import type { PlaybookDefinition } from './playbook';

/**
 * The original Workflows action, now one playbook among however many follow.
 *
 * Thin on purpose: `capture/` owns the mechanism (which tabs are injectable, the character
 * budget, how a refusal is worded) and a playbook owns only what the user picked and what
 * it says about itself.
 */
export const toptalPlaybook: PlaybookDefinition = {
  id: 'toptal',
  label: 'Toptal',
  description:
    'Capture reads the raw HTML of the tab you are looking at and shows it here. It runs ' +
    'entirely on your machine — nothing is sent anywhere and nothing is saved.',
  run: captureActiveTabHtml,
};
