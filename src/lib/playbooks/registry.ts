import type { PlaybookDefinition, PlaybookId } from './playbook';
import { linkedinPostPlaybook } from './linkedin-post';
import { toptalPlaybook } from './toptal';

/** Order here is the order of the picker. */
export const PLAYBOOKS: PlaybookDefinition[] = [toptalPlaybook, linkedinPostPlaybook];

/** Where an unrecognised preference lands, named once so the fallback cannot drift. */
const DEFAULT_PLAYBOOK = toptalPlaybook;

export const DEFAULT_PLAYBOOK_ID: PlaybookId = DEFAULT_PLAYBOOK.id;

/**
 * Takes a `string`, not a `PlaybookId`: the argument comes from storage, so it can be '',
 * or the id of a playbook that existed in an older build. Either way the tab gets a
 * working playbook rather than an empty header.
 */
export function resolvePlaybook(id: string): PlaybookDefinition {
  return PLAYBOOKS.find((p) => p.id === id) ?? DEFAULT_PLAYBOOK;
}
