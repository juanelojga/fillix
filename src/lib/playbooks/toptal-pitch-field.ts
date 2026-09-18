import { readableText } from '../capture/readable-text';

/**
 * Which part of the Job Interest Request form is the pitch, and what Toptal requires of it.
 *
 * Split out of `toptal-application-form.ts` rather than grown into it, by the rule that split
 * `toptal-job-url.ts` from `toptal-job-sections.ts`: which element *is* the pitch and how the
 * form is *walked* change for different reasons, and this one has already changed once
 * underneath us.
 *
 * It changed substantively, not just in name. The field used to be an optional first-person
 * "Relevant experience" box behind `pitchThirdPersonLabel`, holding a textarea named
 * `comment`. It is now a required third-person pitch behind `pitchInput`, holding one named
 * `pitch`, with a stated minimum length. Both hooks are matched because nothing here can know
 * which build a given account is served, and the older one costs one selector to keep.
 */

/** Both generations of Toptal's hook. Document order decides which one a page matches. */
export const PITCH_SELECTORS = '[data-testid="pitchInput"], [data-testid="pitchThirdPersonLabel"]';

/**
 * Toptal's stated floor, as a fallback only — `pitchMinChars` prefers the number the page
 * itself prints. Warning with a stale number is better than not warning, so this is what an
 * unreadable page falls back to rather than 0.
 */
export const PITCH_MIN_CHARS = 180;

/**
 * The pitch's display name and its identity.
 *
 * Deliberately not the page's label text: this string is the `drafts` map key and the `{#each}`
 * key in `ApplicationDrafts.svelte`, so it must not move when Toptal rewords a label — which is
 * exactly what Toptal just did. It is no longer the retrieval query (`buildPitchQuery`) nor the
 * model's instruction (`PITCH_BRIEF`), so a short stable label is all it now has to be.
 */
export const PITCH_QUESTION = 'Third-person pitch';

/** The block of numbered questions. Anything outside it, inside the form, is not one of them. */
const QUESTIONS_BLOCK = '[data-testid="matcherQuestions"]';

const QUESTION_WRAPPERS =
  '[data-testid="matcherQuestionInput"], [data-testid="matcherQuestionSelect"]';

/** 'Write minimum 180 characters', as the page prints it a couple of nodes below the box. */
const MINIMUM_PROSE = /minimum\s+(\d+)\s+characters/i;

/**
 * An autosizing textarea ships a measuring twin carrying the same classes behind `aria-hidden`
 * + `readonly`. Writing to it is invisible to the user and to the form. The same test
 * `toptal-application-form.ts` applies, kept here too because the fallback search below runs
 * over raw textareas rather than over wrappers.
 */
function isFillable(el: Element): boolean {
  return el.getAttribute('aria-hidden') !== 'true' && !el.hasAttribute('readonly');
}

/**
 * The minimum length Toptal will accept, read from the page rather than assumed.
 *
 * The prose sits beside the box rather than inside it, so this reads the wrapper's parent.
 * That is looser than a `data-testid` and is meant to be: the number is the thing worth
 * having, and a missed read costs a fallback rather than a wrong answer.
 */
export function pitchMinChars(wrapper: Element): number {
  const scope = wrapper.parentElement ?? wrapper;
  const stated = MINIMUM_PROSE.exec(readableText(scope))?.[1];
  const parsed = stated ? Number.parseInt(stated, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PITCH_MIN_CHARS;
}

/**
 * The pitch by its shape rather than its hook, for when Toptal renames one again.
 *
 * A fillable textarea inside the application form but outside the numbered questions is,
 * structurally, the pitch. Returns every candidate rather than the first, because the caller
 * has to tell three cases apart: none (this form genuinely has no pitch box — plenty do not),
 * one (that is it), and several (guessing would write a pitch into the wrong box, so the
 * caller says so on screen instead).
 */
export function findFallbackPitch(form: Element): Element[] {
  return Array.from(form.querySelectorAll('textarea')).filter(
    (el) => isFillable(el) && !el.closest(QUESTIONS_BLOCK) && !el.closest(QUESTION_WRAPPERS),
  );
}
