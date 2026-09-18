/**
 * The name the third-person pitch is written under.
 *
 * Toptal's pitch box asks for prose a recruiter forwards to a client, so it reads in the third
 * person — and a pitch that says "The applicant" throughout when the CV has a name on it reads
 * like a form letter. The name is not embedded and not retrieved: it is injected into the
 * prompt, because whether it reaches the model must not depend on cosine similarity ranking
 * the section that happens to carry it.
 *
 * Read from the preamble rather than from a setting, because `chunk.ts` already documents that
 * the prose before the first `##` "is usually the name and contact line" — that convention is
 * stated to the user in the Profile tab, so this adds no new thing for them to maintain.
 *
 * '' is a supported answer, never a guess. `answer-prompt.ts` says "The applicant" instead, and
 * a wrong name in front of a recruiter is worse than a neutral one.
 */

/** A name is short. A line longer than this is a summary or a headline, not a name. */
const MAX_NAME_CHARS = 60;

export function applicantName(markdown: string): string {
  // Everything before the first `##`: the same preamble `chunk.ts` files under 'Overview'.
  const preamble = markdown.split(/^##\s/m)[0] ?? '';

  for (const raw of preamble.split('\n')) {
    // Strips a `# ` title, which is how a CV usually opens; a bare first line works too.
    const line = raw.replace(/^#+\s*/, '').trim();
    if (!line) continue;
    // The first non-blank line is the only candidate: if it is not the name, nothing below it
    // is either, and walking on would find the contact line or the summary's first sentence.
    if (line.length > MAX_NAME_CHARS) return '';
    // 'Email: …', 'Phone: …' — a contact line, which is what follows a name when the name
    // itself was never written down.
    if (line.includes(':')) return '';
    return line;
  }

  return '';
}
