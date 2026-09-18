import type { JobBrief } from '../playbooks/job-brief';

/**
 * The text whose embedding finds the right profile sections for one question.
 *
 * Not the question alone. "What is your experience with their stack?" names no technology at
 * all, and on its own it retrieves whichever section happens to be phrased most like a
 * question. Appending the job's required skills puts the vocabulary that actually matters —
 * Python, FastAPI, React, Next.js — into the vector being searched with.
 *
 * Both claimed and unclaimed skills go in. The unclaimed ones are the likeliest to retrieve a
 * gaps section, which is exactly the evidence an honest answer needs.
 */
export function buildRetrievalQuery(question: string, brief: JobBrief | null): string {
  if (!brief) return question;

  const skills = jobVocabulary(brief);

  return skills.length > 0 ? `${question}\n\n${skills.join(', ')}` : question;
}

function jobVocabulary(brief: JobBrief): string[] {
  return (
    [...brief.skills.required, ...brief.skills.optional]
      .map((s) => s.name)
      // The chips repeat themselves across the two groups on a real posting.
      .filter((name, i, all) => all.indexOf(name) === i)
      .slice(0, 25)
  );
}

/** How much of the description carries the job's subject before it turns into boilerplate. */
const PITCH_QUERY_DESCRIPTION_CHARS = 600;

/**
 * The text whose embedding finds the right profile sections for the pitch.
 *
 * A pitch is not a question, so there is nothing to embed on its side — the field's own label
 * is a UI string, and embedding it would retrieve whichever section reads most like a form
 * field. What the pitch actually needs is "which of my sections best match this job", so the
 * query is the job itself: the opening of the description, plus the same vocabulary a question
 * gets, unclaimed skills included for the same reason.
 *
 * '' when there is no brief. `topChunks` already returns [] for an empty query vector, and
 * `retrieveProfileContext` words that as a refusal rather than as an empty profile.
 */
export function buildPitchQuery(brief: JobBrief | null): string {
  if (!brief) return '';

  const skills = jobVocabulary(brief);
  const description = brief.description.slice(0, PITCH_QUERY_DESCRIPTION_CHARS).trim();

  return [description, skills.join(', ')].filter(Boolean).join('\n\n');
}
