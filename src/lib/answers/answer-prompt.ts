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

/**
 * The rules both prompts obey. Grounding only.
 *
 * Voice and the shape of an unsupported answer are deliberately *not* here: the two prompts
 * disagree about both. A question is answered in the applicant's own first person and, when
 * the profile supports nothing, gets a plain one-sentence denial. A pitch is written in the
 * third person for a recruiter to forward, and an unsupportable one is left empty rather than
 * denied. Keeping either rule shared is what made the pitch inherit the wrong voice.
 */
const SHARED_RULES = [
  "Use ONLY the profile excerpts provided. They are the applicant's own words about their own experience.",
  'If the excerpts do not support a claim, do not make it. You have no other knowledge of this person.',
  'If the question asks about experience the excerpts do not mention, say so plainly. Only add what the nearest real experience is when an excerpt supports it and you cite that excerpt. Never imply familiarity you cannot point at.',
  'Never invent dates, employers, client names, numbers, job titles or technologies.',
  'Plain prose — no markdown, no bullet points, no greeting, no sign-off.',
  'Do not restate the question.',
  '"drew_on" lists the exact ## headings you used, copied character for character from the excerpts.',
  '"gaps" lists anything the question asked about that the excerpts did not support.',
  // The excerpts can carry computed facts — the meeting-hours section states an overlap that
  // `meeting-overlap.ts` worked out in integers. A model asked to check that subtraction will
  // produce a different, confident number, and the applicant is the one who has to keep it.
  'Times, dates and hour counts in the excerpts are already correct. Quote them as written and never recalculate them.',
  'Respond with JSON only: {"text":"...","drew_on":["..."],"gaps":["..."]}',
];

export const DRAFT_SYSTEM_PROMPT = [
  'You are drafting one answer to one question on a job application, on behalf of the applicant.',
  'Write in the first person, as the applicant.',
  ...SHARED_RULES,
  'Never return an empty "text". There is always an answer to give.',
  // The answer to a question the profile cannot support. Bare on purpose: with nothing to
  // cite there is nothing to point at, so any clause after the denial would be invented.
  // `states-no-experience.ts` is what enforces that, and it discards an answer that pads.
  'If no excerpt supports an answer, write one short first-person sentence saying you do not have that experience — "I don\'t have experience with X." — naming what the question asked about and nothing else. No examples, no substitutes, no dates, no employers, no numbers. Leave "drew_on" empty and list what was missing in "gaps". That sentence is the whole answer.',
  'Two to five sentences when the excerpts support an answer. When they do not, one sentence — the one described above.',
].join('\n');

/**
 * The pitch, in the applicant's name and the third person.
 *
 * Toptal's box says "Write your third-person pitch here", and the consent checkbox beside it
 * says the text goes to a recruiter who forwards it to the client — so first person would be
 * the wrong voice for the one field where voice is stated on screen.
 *
 * `name` is '' when the profile names nobody, and "The applicant" is what the prompt then
 * says. Never a guessed name: a wrong one in front of a recruiter is worse than a neutral one.
 *
 * The denial rule is replaced rather than inherited. A third-person denial would not match the
 * first-person NEGATION in `states-no-experience.ts` and would be discarded as ungrounded
 * anyway — but more to the point, "The applicant has no experience with this" is not something
 * to write into a pitch box at all. An empty "text" passes the grounding guard untouched and
 * already renders as "Your profile had nothing for this one", which is the honest outcome.
 */
export function pitchSystemPrompt(name: string): string {
  const subject = name.trim() || 'The applicant';

  return [
    'You are drafting the free-text pitch on a job application, on behalf of the applicant. A recruiter reads it and decides whether to introduce the applicant to the client.',
    `Write in the THIRD person, the way a recruiter would describe them. Refer to the applicant as "${subject}", and afterwards by pronoun. Never write "I" or "my".`,
    ...SHARED_RULES,
    // No "never return an empty text" rule, and no denial rule. Both belong to questions.
    'If the excerpts do not support a pitch for this job, return an empty "text" and list what was missing in "gaps". Do not write a pitch saying what the applicant cannot do — an empty answer is the correct one here.',
    // The length rule carries the condition, not the gap rule below it: a model told to write
    // three paragraphs will pad a denial into three, and padding with nothing to cite is the
    // fabrication this file exists to stop. Later rules dominate earlier ones for small models.
    'Two or three short paragraphs when the excerpts support a pitch. Lead with the experience that matches this job most directly. When they do not support one, do not pad an empty answer into paragraphs — the empty-answer rule above wins.',
    'Name a gap once, briefly, and move on — do not dwell on it and do not apologise for it.',
    // Said twice, and last. Later rules dominate earlier ones for small models, and of
    // everything here the voice is both the least natural instruction to follow — every other
    // prompt in this file asks for "I" — and the most obvious when it comes out wrong. This is
    // the same reason `buildAnswerPrompt` restates the source rule at the very end.
    `Again: third person throughout. Never "I", "me" or "my" — this is written about ${subject}, not by them.`,
  ].join('\n');
}

/**
 * What the pitch box asks for, in the slot a question's own text occupies.
 *
 * Encoded here rather than read off the page. Toptal prints this brief as prose above the box
 * ("Write a paragraph about what makes you the best candidate for this job…") behind no
 * `data-testid` at all, and depending on unhooked prose is the exact failure this change
 * exists to fix.
 */
const PITCH_BRIEF = [
  'Write the pitch for this job: what makes this applicant the best candidate for it.',
  'Lead with the experience that matches the job most directly, and name one specific thing they built or shipped that relates to this engagement.',
].join(' ');

export interface AnswerPromptInput {
  kind: 'question' | 'pitch';
  question: string;
  /** The job, as `buildJobContext` summarised it. */
  job: string;
  /** The retrieved profile sections, headings included, joined. */
  evidence: string;
}

export function systemPromptFor(kind: 'question' | 'pitch', applicantName = ''): string {
  return kind === 'pitch' ? pitchSystemPrompt(applicantName) : DRAFT_SYSTEM_PROMPT;
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
  // The pitch field's own label is a UI string ("Third-person pitch"), not an instruction, so
  // it is the brief that goes to the model.
  const task =
    input.kind === 'pitch'
      ? ['What to write:', PITCH_BRIEF]
      : ['The question to answer:', input.question];

  return [
    'The job:',
    input.job || '(no job details captured)',
    '',
    ...task,
    '',
    "The applicant's profile — the only source you may draw on:",
    // Restating the rule here rather than only in the system prompt is deliberate: this is
    // the very end of the prompt, the one region truncate-from-the-start cannot reach.
    input.evidence ||
      (input.kind === 'pitch'
        ? '(no relevant profile sections were found — return an empty "text" per the rule above)'
        : '(no relevant profile sections were found — answer with the one-sentence "I do not have that experience" rule)'),
  ].join('\n');
}
