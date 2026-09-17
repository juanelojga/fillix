/**
 * The prompts that draft one application answer.
 *
 * In TypeScript rather than `src/prompts/*.md`, by the rule CLAUDE.md states: a prompt that
 * defines the JSON envelope its parser depends on is mechanism, not preference. Changing the
 * wording below changes what `normalizeAnswerDraft` can read.
 *
 * Everything here exists to stop one failure: a fluent, confident claim of experience the
 * applicant does not have. A wrong answer on a job application is not a bad summary — it is
 * something a recruiter will read aloud to a client.
 */

const SHARED_RULES = [
  "Use ONLY the profile excerpts provided. They are the applicant's own words about their own experience.",
  'If the excerpts do not support a claim, do not make it. You have no other knowledge of this person.',
  'If the question asks about experience the excerpts do not mention, say so plainly. Only add what the nearest real experience is when an excerpt supports it and you cite that excerpt. Never imply familiarity you cannot point at.',
  'Never invent dates, employers, client names, numbers, job titles or technologies.',
  'Write in the first person, as the applicant. Plain prose — no markdown, no bullet points, no greeting, no sign-off.',
  'Do not restate the question.',
  '"drew_on" lists the exact ## headings you used, copied character for character from the excerpts.',
  '"gaps" lists anything the question asked about that the excerpts did not support.',
  // The excerpts can carry computed facts — the meeting-hours section states an overlap that
  // `meeting-overlap.ts` worked out in integers. A model asked to check that subtraction will
  // produce a different, confident number, and the applicant is the one who has to keep it.
  'Times, dates and hour counts in the excerpts are already correct. Quote them as written and never recalculate them.',
  'Never return an empty "text". There is always an answer to give.',
  // The answer to a question the profile cannot support. Bare on purpose: with nothing to
  // cite there is nothing to point at, so any clause after the denial would be invented.
  // `states-no-experience.ts` is what enforces that, and it discards an answer that pads.
  'If no excerpt supports an answer, write one short first-person sentence saying you do not have that experience — "I don\'t have experience with X." — naming what the question asked about and nothing else. No examples, no substitutes, no dates, no employers, no numbers. Leave "drew_on" empty and list what was missing in "gaps". That sentence is the whole answer.',
  'Respond with JSON only: {"text":"...","drew_on":["..."],"gaps":["..."]}',
];

export const DRAFT_SYSTEM_PROMPT = [
  'You are drafting one answer to one question on a job application, on behalf of the applicant.',
  ...SHARED_RULES,
  'Two to five sentences when the excerpts support an answer. When they do not, one sentence — the one described above.',
].join('\n');

export const PITCH_SYSTEM_PROMPT = [
  'You are drafting the free-text "relevant experience" pitch on a job application, on behalf of the applicant. A recruiter reads it and decides whether to introduce the applicant to the client.',
  ...SHARED_RULES,
  // The length rule carries the condition, not the gap rule below it: a model told to write
  // three paragraphs will pad a denial into three, and padding with nothing to cite is the
  // fabrication this file exists to stop. Later rules dominate earlier ones for small models.
  'Two or three short paragraphs when the excerpts support a pitch. Lead with the experience that matches this job most directly. When they do not support one, do not pad a denial into paragraphs — the one-sentence rule above wins.',
  'Name a gap once, briefly, and move on — do not dwell on it and do not apologise for it.',
].join('\n');

export interface AnswerPromptInput {
  question: string;
  /** The job, as `buildJobContext` summarised it. */
  job: string;
  /** The retrieved profile sections, headings included, joined. */
  evidence: string;
}

export function systemPromptFor(kind: 'question' | 'pitch'): string {
  return kind === 'pitch' ? PITCH_SYSTEM_PROMPT : DRAFT_SYSTEM_PROMPT;
}

/**
 * Evidence last, and labelled as the only permitted source.
 *
 * Ordering is not cosmetic here: when a local model's context overflows, Ollama truncates from
 * the *start*, so whatever leads is what gets silently dropped. The job description is the
 * longest and least dangerous thing to lose; the applicant's own words are the one thing that
 * must survive.
 */
export function buildAnswerPrompt(input: AnswerPromptInput): string {
  return [
    'The job:',
    input.job || '(no job details captured)',
    '',
    'The question to answer:',
    input.question,
    '',
    "The applicant's profile — the only source you may draw on:",
    // Restating the rule here rather than only in the system prompt is deliberate: this is
    // the very end of the prompt, the one region truncate-from-the-start cannot reach.
    input.evidence ||
      '(no relevant profile sections were found — answer with the one-sentence "I do not have that experience" rule)',
  ].join('\n');
}
