import type { CapturedSection } from './playbook';
import type { JobBrief } from './job-brief';
import { extractJobAttributes } from './toptal-job-attributes';
import { extractJobSkills } from './toptal-job-skills';

/**
 * The captured Toptal job as a typed brief.
 *
 * Thin on purpose, like `toptal.ts`: the two things that are genuinely Toptal's — how its
 * attributes grid reads and how its skill chips mark what the profile claims — each live in
 * their own file, because Toptal can change one without touching the other. What is left here
 * is which decoded section feeds which parser, and that is all.
 *
 * Takes both the decoded sections and the raw markup because the two parsers genuinely need
 * different things: the attributes grid is easiest as flattened text, and the skills split
 * exists only as an attribute.
 */

/** Toptal's own trailer on a folded block. Not content, and it would read as a claim. */
const FOLD_TRAILERS = /\n?(Show More|Show more)\s*$/;

function sectionBody(sections: CapturedSection[], heading: string): string {
  const section = sections.find((s) => s.heading === heading);
  return section?.found ? section.body : '';
}

export function buildJobBrief(sections: CapturedSection[], html: string): JobBrief {
  return {
    description: sectionBody(sections, 'Job Description').replace(FOLD_TRAILERS, '').trim(),
    attributes: extractJobAttributes(sectionBody(sections, 'Job Attributes')),
    skills: extractJobSkills(html),
  };
}
