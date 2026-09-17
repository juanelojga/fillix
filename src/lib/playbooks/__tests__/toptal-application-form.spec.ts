// @vitest-environment jsdom
// extractApplicationFields parses with DOMParser, which node does not have. The panel does.
import { describe, it, expect } from 'vitest';
import { extractApplicationFields } from '../toptal-application-form';

/**
 * Cut from a real capture of https://talent.toptal.com/portal/job/…/confirm, trimmed to the
 * hooks and attributes the parser reads. The two details worth keeping verbatim:
 *   - every matcherQuestionInput holds TWO textareas, the second an aria-hidden readonly
 *     measuring twin carrying identical classes;
 *   - the first question is a dropdown, not a text box: a readonly text input plus a hidden
 *     input that carries the real value.
 */
const Q = (suffix: string) =>
  `matcherQuestionsAnswers[VjEtSm9iUG9zaXRpb25RdWVzdGlvbi02NjMyNT${suffix}]`;

function textQuestion(name: string, label: string, value = ''): string {
  return `
    <div data-testid="matcherQuestionInput">
      <label for="${name}"><span class="text-[0.875rem]">${label}</span></label>
      <div class="base-Input-root">
        <textarea autocomplete="none" id="${name}" name="${name}" type="text">${value}</textarea>
        <textarea aria-hidden="true" readonly tabindex="-1"></textarea>
      </div>
    </div>`;
}

const FORM = `
<html><body><form>
  <div data-testid="matcherQuestions">
    <div data-testid="matcherQuestionSelect">
      <label for="${Q('c')}2q43dwn"><span class="text-[0.875rem]">How soon can you start working on this role/position?</span></label>
      <input type="hidden" name="${Q('c')}" value="Immediately">
      <input readonly type="text" id="${Q('c')}2q43dwn" value="Immediately">
    </div>
    ${textQuestion(Q('g'), 'Are you available to interview during these times?')}
    ${textQuestion(Q('h'), 'Do you happen to be a Spanish speaker?')}
  </div>
  <div data-testid="pitchThirdPersonLabel">
    <label for="comment"><span><span class="inline-flex">Relevant experience<div data-testid="infoIcon"><svg viewBox="0 0 16 16"><path d="M8 16"></path></svg></div></span> (optional)</span></label>
    <textarea id="comment" name="comment" placeholder="Type here..."></textarea>
    <textarea aria-hidden="true" readonly tabindex="-1"></textarea>
  </div>
  <input id="understand" name="understand" type="checkbox">
  <button type="submit" data-testid="submitApplication">Submit Application</button>
</form></body></html>`;

describe('extractApplicationFields', () => {
  it('finds every answerable field, in the order the page shows them', () => {
    const fields = extractApplicationFields(FORM);

    expect(fields.map((f) => f.kind)).toEqual(['choice', 'question', 'question', 'pitch']);
    expect(fields[1].question).toBe('Are you available to interview during these times?');
    expect(fields[2].question).toBe('Do you happen to be a Spanish speaker?');
  });

  // The name is Toptal's own GraphQL id for the question, stable for the life of the job
  // posting — the only locator here that survives a question being inserted above it.
  it('locates a text question by its name attribute', () => {
    const fields = extractApplicationFields(FORM);

    expect(fields[1].locator).toEqual({ by: 'name', value: Q('g') });
    expect(fields[1].unfillableReason).toBe('');
  });

  it('locates the pitch by its own name, which is not a question id at all', () => {
    const [, , , pitch] = extractApplicationFields(FORM);

    expect(pitch.locator).toEqual({ by: 'name', value: 'comment' });
  });

  // The label reads "Relevant experience (optional)" and wraps an info icon. Neither the
  // parenthetical nor the icon is the question.
  it('names the pitch field without the label furniture', () => {
    const [, , , pitch] = extractApplicationFields(FORM);

    expect(pitch.question).toBe('Relevant experience');
  });

  // The dropdown is a readonly input plus a hidden field, driven by React state. Writing to
  // either does nothing the form will read, so offering to fill it would be a lie.
  it('refuses the dropdown question in words, and keeps what it is already set to', () => {
    const [choice] = extractApplicationFields(FORM);

    expect(choice.locator).toBeNull();
    expect(choice.unfillableReason).toMatch(/dropdown/);
    expect(choice.prefilled).toBe('Immediately');
  });

  // The autosize twin is a sibling with the same classes, so a naive querySelector('textarea')
  // can pick it — and a value written there is invisible to the user and to the form.
  it('never locates the aria-hidden measuring twin', () => {
    const fields = extractApplicationFields(FORM);

    for (const field of fields) {
      if (field.locator?.by === 'name') {
        expect(field.locator.value).not.toBe('');
      }
    }
    // Two real textareas plus the pitch: three locators, no duplicates.
    const located = fields.filter((f) => f.locator).map((f) => JSON.stringify(f.locator));
    expect(new Set(located).size).toBe(located.length);
  });

  it('carries a prefilled answer through', () => {
    const html = FORM.replace(
      textQuestion(Q('h'), 'Do you happen to be a Spanish speaker?'),
      textQuestion(Q('h'), 'Do you happen to be a Spanish speaker?', 'Yes, native.'),
    );

    const fields = extractApplicationFields(html);
    expect(fields[2].prefilled).toBe('Yes, native.');
  });

  // Falls back rather than dropping the field: an unnamed control is still one the user can
  // see, and "field 1" is a worse locator than a name but a better outcome than silence.
  it('falls back to position when a control carries no name or id', () => {
    const html = FORM.replace(
      `<textarea autocomplete="none" id="${Q('g')}" name="${Q('g')}" type="text"></textarea>`,
      '<textarea type="text"></textarea>',
    );

    const fields = extractApplicationFields(html);
    expect(fields[1].locator).toEqual({ by: 'ordinal', index: 0 });
  });

  // The question is still on screen, so the panel must name it as unanswerable rather than
  // quietly showing one question fewer than the page does.
  it('words a question whose text box is gone instead of dropping it', () => {
    const html = FORM.replace(
      `<textarea autocomplete="none" id="${Q('h')}" name="${Q('h')}" type="text"></textarea>`,
      '',
    );

    const fields = extractApplicationFields(html);
    expect(fields[2].question).toBe('Do you happen to be a Spanish speaker?');
    expect(fields[2].locator).toBeNull();
    expect(fields[2].unfillableReason).toMatch(/not on the page|text box is not/);
  });

  it('returns nothing when the page has no application form', () => {
    expect(extractApplicationFields('<html><body><p>No form here</p></body></html>')).toEqual([]);
  });
});
