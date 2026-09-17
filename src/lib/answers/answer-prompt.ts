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
  'If the question asks about experience the excerpts do not mention, say so plainly in one short clause, then say what the nearest real experience is. Never imply familiarity you cannot point at.',
  'Never invent dates, employers, client names, numbers, job titles or technologies.',
  'Write in the first person, as the applicant. Plain prose — no markdown, no bullet points, no greeting, no sign-off.',
  'Do not restate the question.',
  '"drew_on" lists the exact ## headings you used, copied character for character from the excerpts.',
  '"gaps" lists anything the question asked about that the excerpts did not support.',
  'If no excerpt is relevant, return an empty "text" and an empty "drew_on". A blank answer is the correct answer when there is nothing true to say.',
  'Respond with JSON only: {"text":"...","drew_on":["..."],"gaps":["..."]}',
];

export const DRAFT_SYSTEM_PROMPT = [
  'You are drafting one answer to one question on a job application, on behalf of the applicant.',
  ...SHARED_RULES,
  'Two to five sentences. Answer the question asked and stop.',
].join('\n');

export const PITCH_SYSTEM_PROMPT = [
  'You are drafting the free-text "relevant experience" pitch on a job application, on behalf of the applicant. A recruiter reads it and decides whether to introduce the applicant to the client.',
  ...SHARED_RULES,
  'Two or three short paragraphs. Lead with the experience that matches this job most directly.',
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
    input.evidence || '(no relevant profile sections were found)',
  ].join('\n');
}
