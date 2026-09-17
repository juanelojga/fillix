/**
 * What a captured job posting says, in a shape the drafting step can use.
 *
 * Deliberately free of Toptal: a description, an attributes grid and a required/optional skill
 * split are what every job board has, and `playbooks/` is a menu that may grow. The Toptal
 * parsers fill this in; nothing here knows how.
 */

export interface SkillMention {
  name: string;
  /**
   * Whether the user's own profile on the site already claims this skill.
   *
   * This is the gaps signal the whole grounding design leans on: a required skill the profile
   * does not claim is the one a drafted answer must not imply experience with.
   */
  onProfile: boolean;
  /**
   * The site's own count beside a claimed skill — endorsements, connections, whatever it
   * counts. Never years, and never a proficiency: shown, never reasoned with.
   */
  connections: number | null;
}

export interface JobBrief {
  /** The full posting text, folded sections included. */
  description: string;
  /** The attributes grid as it was labelled: commitment, time zone, workday overlap, … */
  attributes: Record<string, string>;
  skills: { required: SkillMention[]; optional: SkillMention[] };
}

/** Required skills the user's profile does not claim — the gaps, named once. */
export function missingRequiredSkills(brief: JobBrief): string[] {
  return brief.skills.required.filter((s) => !s.onProfile).map((s) => s.name);
}
