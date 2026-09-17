/**
 * The profile document, split into the pieces retrieval scores.
 *
 * Splits on `##` headings because that is the contract the Profile tab states to the user and
 * counts back to them: a heading is both the retrieval key and the citation a drafted answer
 * carries, so the author decides the granularity, not this module.
 */

export interface ProfileChunk {
  /** Stable within one document: heading slug plus part number. */
  id: string;
  /** The `##` heading this text came from, verbatim — what an answer cites. */
  heading: string;
  /** Position in the document, so a tie in score falls back to the author's order. */
  ordinal: number;
  /** The section body, with the heading line prepended so an embedding sees its own subject. */
  text: string;
}

/**
 * A ceiling, not a target. Eight of these plus a job description has to leave room inside a
 * local model's context, and a section longer than this is almost always several subjects the
 * author has not separated yet.
 */
export const MAX_CHUNK_CHARS = 1_200;

/** Prose before the first `##`, which is usually the name and contact line. */
const PREAMBLE_HEADING = 'Overview';

function slug(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'section'
  );
}

/**
 * Splits an over-long section on blank lines, never mid-paragraph: a chunk cut through the
 * middle of a sentence embeds as neither half and reads as gibberish when cited.
 */
function splitLong(body: string): string[] {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const parts: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS || !current) {
      current = candidate;
      continue;
    }
    parts.push(current);
    current = paragraph;
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkProfile(markdown: string): ProfileChunk[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  const sections: { heading: string; body: string[] }[] = [];
  let open: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    // `##` exactly — `###` is the author subdividing within a subject they already named, and
    // promoting it to its own chunk would cite a heading the answer's subject does not match.
    const match = /^##\s+(\S.*)$/.exec(line);
    if (match) {
      if (open) sections.push(open);
      open = { heading: match[1].trim(), body: [] };
      continue;
    }
    if (!open) {
      if (line.trim().length === 0 && sections.length === 0) continue;
      open = { heading: PREAMBLE_HEADING, body: [] };
    }
    open.body.push(line);
  }
  if (open) sections.push(open);

  const chunks: ProfileChunk[] = [];
  let ordinal = 0;

  for (const section of sections) {
    const body = section.body.join('\n').trim();
    if (!body) continue;

    const parts = splitLong(body);
    parts.forEach((part, index) => {
      // The heading rides along in the embedded text: "Eight years of FastAPI" and the
      // heading "Python, FastAPI and Django" score very differently against "Do you know
      // Python?", and only one of them is what the author meant the section to be about.
      const suffix = parts.length > 1 ? ` (${index + 1}/${parts.length})` : '';
      chunks.push({
        id: `${slug(section.heading)}-${index}`,
        heading: `${section.heading}${suffix}`,
        ordinal,
        text: `## ${section.heading}${suffix}\n\n${part}`,
      });
      ordinal += 1;
    });
  }

  return chunks;
}
