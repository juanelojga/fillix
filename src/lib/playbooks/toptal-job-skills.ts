import { readableText } from '../capture/readable-text';
import type { SkillMention } from './job-brief';

/**
 * Toptal's skill chips, split by whether the user's own profile claims each one.
 *
 * Parses the **markup**, not the decoded text, and that is the whole point of the file. In the
 * decoded text a claimed skill reads `Python6` and an unclaimed one reads `Payment APIs`, so
 * the only available signal is "does this line end in a digit" — which misreads any skill whose
 * name ends in one (`Web3`, `Vue 3`, `GPT-4`) and would silently claim experience the user does
 * not have. In the markup the answer is explicit: `aria-disabled="true"` is Toptal greying out
 * a skill the profile lacks.
 *
 * The number beside a claimed skill is a **connection count**, not years and not a level. It is
 * carried through for display and is never reasoned with.
 */

const REQUIRED = '[data-testid="requiredSkillsWrapper"]';
const OPTIONAL = '[data-testid="optionalSkillsWrapper"]';
const CHIP = '[data-testid="jobSkillLabel"]';
const COUNT = '[data-testid="connectionCount"]';

function readChip(chip: Element): SkillMention | null {
  // Cloned before surgery: the caller's document is a parsed capture that other parsers read
  // afterwards, and removing a node from it would change what they see.
  const clone = chip.cloneNode(true) as Element;
  const count = clone.querySelector(COUNT);
  const connections = count ? Number.parseInt(readableText(count), 10) : Number.NaN;
  count?.remove();

  const name = readableText(clone);
  if (!name) return null;

  return {
    name,
    onProfile: chip.getAttribute('aria-disabled') !== 'true',
    connections: Number.isFinite(connections) ? connections : null,
  };
}

function readGroup(doc: Document, selector: string): SkillMention[] {
  const wrapper = doc.querySelector(selector);
  if (!wrapper) return [];
  return Array.from(wrapper.querySelectorAll(CHIP))
    .map(readChip)
    .filter((skill): skill is SkillMention => skill !== null);
}

export function extractJobSkills(html: string): {
  required: SkillMention[];
  optional: SkillMention[];
} {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return { required: readGroup(doc, REQUIRED), optional: readGroup(doc, OPTIONAL) };
}
