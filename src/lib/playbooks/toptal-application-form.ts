import { readableText } from '../capture/readable-text';
import type { FieldLocator } from '../capture/field-locator';
import {
  PITCH_QUESTION,
  PITCH_SELECTORS,
  findFallbackPitch,
  pitchMinChars,
} from './toptal-pitch-field';

/**
 * The Job Interest Request form, as answerable fields.
 *
 * Keyed on Toptal's own `data-testid` hooks for the same reason `toptal-job-sections.ts` is:
 * the class names are build-hashed styled-components ids (`MatcherQuestionInput___Styled…`)
 * and change on every deploy, while these are the handles their own tests hold.
 */

export type FieldKind = 'question' | 'pitch' | 'choice';

export interface ApplicationField {
  /** The question as the page words it, used both on screen and as the retrieval query. */
  question: string;
  kind: FieldKind;
  /** null when nothing can be written here — named on screen, never silently skipped. */
  locator: FieldLocator | null;
  /** Why the locator is null. '' when there is one. */
  unfillableReason: string;
  /**
   * What the page already holds. Attribute-serialized only: `outerHTML` writes a
   * `<textarea>`'s *initial* content, so anything typed and not submitted is absent here.
   */
  prefilled: string;
  /**
   * The shortest value the page will accept, or 0 when it states none. Carried on the field
   * rather than read in the card, because it is Toptal's rule and `AnswerCard.svelte` should
   * not know which site it is rendering.
   */
  minChars: number;
}

/**
 * The hook the locators were computed inside. An `ordinal` means "nth field within the form
 * enclosing this", so the filler has to be handed the same anchor to count within the same
 * form — otherwise it counts the whole document and lands somewhere else entirely.
 */
export const APPLICATION_FORM_ANCHOR = '[data-testid="matcherQuestions"]';

const SELECT_FIELD = '[data-testid="matcherQuestionSelect"]';
const TEXT_FIELD = '[data-testid="matcherQuestionInput"]';

// Short because it repeats verbatim under every choice question, and the *why* (a hidden
// field behind a readonly input) changes nothing the user can act on. The two reasons below
// stay long: they are markup drift, not boilerplate.
const CHOICE_REASON = 'A dropdown, not a text box — pick it yourself.';

const NO_CONTROL_REASON =
  'The question is on the page but its text box is not — Toptal may have changed its markup.';

/**
 * Said out loud rather than guessed at. Several unclaimed text boxes means the hook moved
 * *and* the shape is ambiguous, and writing a pitch into the wrong one is the worst thing
 * this feature could do — so the field is named as unfillable and the user fills it by hand.
 */
const AMBIGUOUS_PITCH_REASON =
  "The pitch box could not be identified — Toptal's markup has changed and more than one " +
  'text box here could be it. Write this one yourself.';

/**
 * The control to write into, skipping the two that must never be written.
 *
 * An autosizing textarea ships a measuring twin carrying the same classes behind
 * `aria-hidden` + `readonly`; writing to it is invisible and writing to it *first* is what a
 * naive `querySelector('textarea')` does, because the twin and the real control are siblings.
 */
function fillableTextarea(root: Element): HTMLTextAreaElement | null {
  for (const el of Array.from(root.querySelectorAll('textarea'))) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.hasAttribute('readonly')) continue;
    return el;
  }
  return null;
}

/** name → id → position. See `field-locator.ts` for why that order. */
function locate(el: Element, ordinal: number): FieldLocator {
  const name = el.getAttribute('name');
  if (name) return { by: 'name', value: name };
  const id = el.getAttribute('id');
  if (id) return { by: 'id', value: id };
  return { by: 'ordinal', index: ordinal };
}

function questionText(wrapper: Element): string {
  const label = wrapper.querySelector('label');
  return label ? readableText(label) : '';
}

/**
 * Captured markup → the fields of the application form.
 *
 * Parses here rather than in the injected function for the same reason `extractJobSections`
 * does: the side panel is a real document with a `DOMParser`, so the selector table stays an
 * ordinary testable module instead of being inlined into one stringified function.
 *
 * Returns [] when the form is absent — the tab already words a missing section, and an empty
 * list of questions is not a different story from a missing form.
 */
export function extractApplicationFields(html: string): ApplicationField[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchor = doc.querySelector(APPLICATION_FORM_ANCHOR);
  const form = anchor?.closest('form');
  if (!form) return [];

  const fields: ApplicationField[] = [];
  // One ordered walk, so the ordinal fallback counts the same fields the user sees, in the
  // order they see them.
  const wrappers = form.querySelectorAll(`${SELECT_FIELD}, ${TEXT_FIELD}, ${PITCH_SELECTORS}`);

  let ordinal = 0;
  for (const wrapper of Array.from(wrappers)) {
    const isPitch = wrapper.matches(PITCH_SELECTORS);

    if (wrapper.matches(SELECT_FIELD)) {
      const hidden = wrapper.querySelector('input[type="hidden"]');
      fields.push({
        question: questionText(wrapper),
        kind: 'choice',
        locator: null,
        unfillableReason: CHOICE_REASON,
        prefilled: hidden?.getAttribute('value') ?? '',
        minChars: 0,
      });
      continue;
    }

    const control = fillableTextarea(wrapper);
    if (!control) {
      fields.push({
        question: isPitch ? PITCH_QUESTION : questionText(wrapper),
        kind: isPitch ? 'pitch' : 'question',
        locator: null,
        unfillableReason: NO_CONTROL_REASON,
        prefilled: '',
        minChars: 0,
      });
      continue;
    }

    fields.push({
      question: isPitch ? PITCH_QUESTION : questionText(wrapper),
      kind: isPitch ? 'pitch' : 'question',
      locator: locate(control, ordinal),
      unfillableReason: '',
      prefilled: control.textContent ?? '',
      minChars: isPitch ? pitchMinChars(wrapper) : 0,
    });
    ordinal += 1;
  }

  if (!fields.some((f) => f.kind === 'pitch')) {
    const recovered = recoverPitch(form, ordinal);
    if (recovered) fields.push(recovered);
  }

  return fields;
}

/**
 * The pitch when neither hook matched, found by its shape instead.
 *
 * Null rather than a placeholder when there is no candidate: plenty of Toptal applications
 * genuinely have no pitch box, and a warning there would be a false alarm about a page that is
 * behaving normally. Only the ambiguous case — several unclaimed boxes — is worth saying, and
 * it is said through the same `locator: null` card an unanswerable question already uses.
 */
function recoverPitch(form: Element, ordinal: number): ApplicationField | null {
  const candidates = findFallbackPitch(form);
  if (candidates.length === 0) return null;

  const base = {
    question: PITCH_QUESTION,
    kind: 'pitch' as const,
    prefilled: '',
  };

  if (candidates.length > 1) {
    return { ...base, locator: null, unfillableReason: AMBIGUOUS_PITCH_REASON, minChars: 0 };
  }

  const control = candidates[0];
  return {
    ...base,
    locator: locate(control, ordinal),
    unfillableReason: '',
    prefilled: control.textContent ?? '',
    minChars: pitchMinChars(control),
  };
}
