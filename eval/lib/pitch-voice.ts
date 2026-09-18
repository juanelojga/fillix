/**
 * Whether a drafted pitch is written the way `pitchSystemPrompt` asked for it.
 *
 * The deliberate mirror of `src/lib/answers/states-no-experience.ts`, and separate from it for
 * the reason that module's own header gives: the two are asked opposite questions. That one
 * decides whether an *uncited* first-person answer is an honest denial, and lets it through.
 * This one decides whether a *pitch* went wrong, and a pitch has three ways to do that which
 * nothing in `src/` can see — the voice, a denial written where an empty answer belongs, and a
 * subject the text never names.
 *
 * It lives in `eval/` rather than `src/` because production has nothing to do with the answer.
 * `normalizeAnswerDraft` cannot reject a first-person pitch: by then the model has spent two
 * minutes, and handing the user nothing is worse than handing them a pitch in the wrong person
 * that they can reword. Grading it is a different job from shipping it.
 */

/**
 * The `I`-forms, matched **case-sensitively**. A case-insensitive `\bI\b` matches a lone
 * lowercase `i`, which appears in ordinary prose far more often than a voice slip does, and a
 * check that cries wolf gets ignored. As written it already cannot fire inside `AI`, `UI`,
 * `CI` or `I18n`: every one of those puts a word character on one side of the `I`.
 *
 * Both apostrophes, straight and typographic, exactly as `NEGATION` does — a model emits either.
 */
const FIRST_PERSON_I = /\bI(?:[’'](?:m|ve|d|ll))?\b/g;

/** The rest, where case carries no signal: "My" opens a sentence as readily as "my". */
const FIRST_PERSON_POSSESSIVE = /\b(?:myself|mine|my|me)\b/gi;

/**
 * Every first-person form in the text, deduped and in the order they appear.
 *
 * Returns the hits rather than a boolean so the check's `detail` can print what it found. A
 * failure reading `pitch-voice: "I", "my"` is actionable without re-running the model; one
 * reading `pitch-voice: false` is not.
 */
export function firstPersonHits(text: string): string[] {
  const hits = [...text.matchAll(FIRST_PERSON_I), ...text.matchAll(FIRST_PERSON_POSSESSIVE)].map(
    (m) => m[0],
  );
  return [...new Set(hits)];
}

/** Words too generic to prove the subject was named. 'The applicant' must match on 'applicant'. */
const SUBJECT_STOPWORDS = new Set(['the', 'and']);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether the pitch ever names who it is about.
 *
 * `subject` is what `pitchSystemPrompt` was actually given — the injected
 * `applicantName(markdown)`, or 'The applicant' when that is '' — never a name guessed here.
 * A check that decided for itself who the applicant is would grade a different prompt than the
 * one that ran.
 *
 * Any one significant word of the subject counts, not the whole string. The model is told to
 * name the applicant once and use pronouns afterwards, so 'Alex Rivera' and 'Rivera' are both
 * the instruction being followed; requiring the full string would fail on the second and, with
 * the frozen profile's `— Profile` suffix, on both.
 */
export function namesSubject(text: string, subject: string): boolean {
  const words = (subject.trim() || 'The applicant')
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3 && !SUBJECT_STOPWORDS.has(w.toLowerCase()));

  if (words.length === 0) return false;
  return words.some((w) => new RegExp(`\\b${escape(w)}\\b`, 'iu').test(text));
}

/**
 * A denial is short. Well above the 180 characters Toptal's box demands, and well below the two
 * or three paragraphs `pitchSystemPrompt` asks for — which is the whole discrimination this
 * bound is doing, so it is worth saying why it is not tighter and not looser.
 */
const MAX_DENIAL_CHARS = 400;

/**
 * Third person and pronoun-agnostic: the subject may be a name, `he`, `she` or `they`, and the
 * first-person `NEGATION` in `states-no-experience.ts` matches none of them. That regex being
 * blind to exactly this is why the pitch needs its own.
 */
const THIRD_PERSON_NEGATION =
  /\b(?:has|have|had|does|do)\s+(?:no|not|never)\b|\blacks\b|\b(?:is|are)\s+not\s+(?:familiar|experienced)\b|\bno\s+(?:direct\s+)?(?:experience|background|exposure)\b|\bnever\s+(?:worked|used)\b|\bnothing\s+in\s+(?:his|her|their|the)\b/i;

/** Up to the first sentence end, like `states-no-experience.ts`. `Node.js` cuts it short, which
 * only ever makes the window stricter: a denial leads with its negation. */
function firstSentence(text: string): string {
  return /^[^.!?]*/.exec(text)?.[0] ?? text;
}

/**
 * Whether the model wrote a denial where `pitchSystemPrompt` asks for an empty `text`.
 *
 * Structural, and deliberately **not** a scan of the whole pitch. The prompt explicitly allows
 * "Name a gap once, briefly, and move on", so a whole-text negation scan would fail every
 * correct pitch that does what it was told. What separates the two is shape, not tone: a real
 * pitch leads with the matching experience and runs to paragraphs, while a denial leads with
 * the negation and stops — there is nothing else to say. So both conditions must hold.
 *
 * The residual false positive is the pitch that opens "While Rivera has not worked with
 * Kubernetes, he has…". That is a real pitch, and it is excluded by length: it is followed by
 * the two paragraphs that justify it.
 *
 * '' is not a denial. It is the correct answer for an unsupportable pitch, and reading it as a
 * failure would fail the one outcome the prompt asks for.
 */
export function readsAsDenial(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_DENIAL_CHARS) return false;
  return THIRD_PERSON_NEGATION.test(firstSentence(trimmed));
}
