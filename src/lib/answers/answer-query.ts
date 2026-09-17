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

  const skills = [...brief.skills.required, ...brief.skills.optional]
    .map((s) => s.name)
    // The chips repeat themselves across the two groups on a real posting.
    .filter((name, i, all) => all.indexOf(name) === i)
    .slice(0, 25);

  return skills.length > 0 ? `${question}\n\n${skills.join(', ')}` : question;
}
