import { readableText } from '../capture/readable-text';
import type { FieldLocator } from '../capture/field-locator';

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
}

/**
 * The hook the locators were computed inside. An `ordinal` means "nth field within the form
 * enclosing this", so the filler has to be handed the same anchor to count within the same
 * form — otherwise it counts the whole document and lands somewhere else entirely.
 */
export const APPLICATION_FORM_ANCHOR = '[data-testid="matcherQuestions"]';

const SELECT_FIELD = '[data-testid="matcherQuestionSelect"]';
const TEXT_FIELD = '[data-testid="matcherQuestionInput"]';
const PITCH_FIELD = '[data-testid="pitchThirdPersonLabel"]';

/** The label carries the prose "(optional)" and an info icon; neither is the question. */
const PITCH_QUESTION = 'Relevant experience';

const CHOICE_REASON =
  'Toptal renders this one as a dropdown backed by a hidden field, not a text box — ' +
  'pick the answer yourself.';

const NO_CONTROL_REASON =
  'The question is on the page but its text box is not — Toptal may have changed its markup.';

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
  const wrappers = form.querySelectorAll(`${SELECT_FIELD}, ${TEXT_FIELD}, ${PITCH_FIELD}`);

  let ordinal = 0;
  for (const wrapper of Array.from(wrappers)) {
    const isPitch = wrapper.matches(PITCH_FIELD);

    if (wrapper.matches(SELECT_FIELD)) {
      const hidden = wrapper.querySelector('input[type="hidden"]');
      fields.push({
        question: questionText(wrapper),
        kind: 'choice',
        locator: null,
        unfillableReason: CHOICE_REASON,
        prefilled: hidden?.getAttribute('value') ?? '',
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
      });
      continue;
    }

    fields.push({
      question: isPitch ? PITCH_QUESTION : questionText(wrapper),
      kind: isPitch ? 'pitch' : 'question',
      locator: locate(control, ordinal),
      unfillableReason: '',
      prefilled: control.textContent ?? '',
    });
    ordinal += 1;
  }

  return fields;
}
