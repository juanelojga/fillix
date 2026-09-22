import type { ComposePlaybook } from './playbook';

/**
 * The composer, as a row in the Workflows picker.
 *
 * As thin as `toptal.ts` and for the same reason: `playbooks/` is the menu of things the
 * user can pick, and everything this one actually does lives in `lib/linkedin/` and
 * `sidepanel/stores/composer*.ts`. What belongs here is the label, the empty state, and
 * the declaration that this is a compose playbook rather than a capture.
 */
export const LINKEDIN_POST_ID = 'linkedin-post';

export const linkedinPostPlaybook: ComposePlaybook = {
  kind: 'compose',
  id: LINKEDIN_POST_ID,
  label: 'LinkedIn post',
  description:
    'Suggest topics reads your voice spec and proposes five posts you could write. Pick ' +
    'one and it researches the topic, works out an angle, and drafts the post in your ' +
    'voice — then you edit it and copy it. Drafting runs on your machine; only the ' +
    'research leaves it, and nothing is ever posted for you.',
};
