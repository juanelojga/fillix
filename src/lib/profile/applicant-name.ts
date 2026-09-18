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

/**
 * `— Profile`, `- CV`, `– Résumé`: the tail of a document title, and not part of anyone's name.
 *
 * Titling a CV `# Alex Rivera — Profile` is the ordinary way to write one, and stripping only
 * the `#` made `pitchSystemPrompt` open every pitch with "Alex Rivera — Profile is a Senior
 * Software Engineer…" — in the box Toptal forwards to a client. Nothing downstream can catch
 * that: the name is injected rather than retrieved, so no citation check sees it, and the pitch
 * reads perfectly fluently with it.
 *
 * Stripped rather than rejected, because the name is right there and '' costs the pitch a real
 * one for a suffix the author never meant as part of it.
 */
const DOCUMENT_SUFFIX = /[—–-]\s*(?:profile|cv|r[ée]sum[ée]|curriculum vitae)\s*$/i;

export function applicantName(markdown: string): string {
  // Everything before the first `##`: the same preamble `chunk.ts` files under 'Overview'.
  const preamble = markdown.split(/^##\s/m)[0] ?? '';

  for (const raw of preamble.split('\n')) {
    // Strips a `# ` title, which is how a CV usually opens; a bare first line works too.
    const heading = raw.replace(/^#+\s*/, '').trim();
    if (!heading) continue;
    // The first non-blank line is the only candidate: if it is not the name, nothing below it
    // is either, and walking on would find the contact line or the summary's first sentence.
    // Everything below is judged on what is left once the document suffix is off, so a real
    // name is not rejected for the length or the punctuation of a title it never chose.
    const line = heading.replace(DOCUMENT_SUFFIX, '').trim();
    // The whole line was the title — there is no name here to write a pitch about.
    if (!line) return '';
    if (line.length > MAX_NAME_CHARS) return '';
    // 'Email: …', 'Phone: …' — a contact line, which is what follows a name when the name
    // itself was never written down.
    if (line.includes(':')) return '';
    return line;
  }

  return '';
}
