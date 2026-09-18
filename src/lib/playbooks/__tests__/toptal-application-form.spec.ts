// @vitest-environment jsdom
// extractApplicationFields parses with DOMParser, which node does not have. The panel does.
import { describe, it, expect } from 'vitest';
import { extractApplicationFields } from '../toptal-application-form';
import { PITCH_MIN_CHARS } from '../toptal-pitch-field';

/**
 * Cut from a real capture of https://talent.toptal.com/portal/job/…/confirm, trimmed to the
 * hooks and attributes the parser reads. The details worth keeping verbatim:
 *   - the first question is a dropdown, not a text box: a readonly text input plus a hidden
 *     input that carries the real value;
 *   - the pitch sits outside the `matcherQuestions` block but inside the same form;
 *   - "Write minimum 180 characters" is printed beside the pitch box, not inside it;
 *   - a shared aria-hidden autosize twin lives at the end of the document, outside the form.
 *
 * `LEGACY_FORM` below is the shape Toptal shipped before renaming the pitch hook. Both are
 * tested because nothing here can know which build a given account is served.
 */
const Q = (suffix: string) =>
  `matcherQuestionsAnswers[VjEtSm9iUG9zaXRpb25RdWVzdGlvbi02NjMyNT${suffix}]`;

function textQuestion(name: string, label: string, value = ''): string {
  return `
    <div data-testid="matcherQuestionInput">
      <label for="${name}"><span class="text-[0.875rem]">${label}</span></label>
      <div class="relative inline-flex">
        <textarea autocomplete="none" id="${name}" name="${name}" type="text">${value}</textarea>
      </div>
    </div>`;
}

const PITCH_BLOCK = `
  <div class="mt-6">
    <div class="mb-4"><div data-testid="list-heading">Write a paragraph about what makes you the best candidate for this job.</div></div>
    <div data-testid="pitchInput">
      <div data-testid="pitchFieldHeader">
        <label for="pitch"><span><span class="inline-flex">Write your third-person pitch here<div data-testid="infoIcon"><svg viewBox="0 0 16 16"><path d="M8 16"></path></svg></div></span></span></label>
        <button type="button" data-testid="seePastPitchesButton"><span>See Past Pitches</span></button>
      </div>
      <div class="relative inline-flex">
        <textarea aria-label="Write your third-person pitch here" autocomplete="none" id="pitch" name="pitch" type="text"></textarea>
      </div>
    </div>
    <div class="mt-2"><p>Write minimum 180 characters</p></div>
  </div>`;

function page(body: string): string {
  return `<html><body><form>
  <div data-testid="matcherQuestions">
    <div data-testid="matcherQuestionSelect">
      <label for="${Q('c')}2q43dwn"><span class="text-[0.875rem]">How soon can you start working on this role/position?</span></label>
      <input type="hidden" name="${Q('c')}" value="Immediately">
      <input readonly type="text" id="${Q('c')}2q43dwn" value="Immediately">
    </div>
    ${textQuestion(Q('g'), 'Are you available to interview during these times?')}
    ${textQuestion(Q('h'), 'Do you happen to be a Spanish speaker?')}
  </div>
  ${body}
  <input id="understand" name="understand" type="checkbox">
  <button type="submit" data-testid="submitApplication">Submit Application</button>
</form>
<textarea aria-hidden="true" readonly tabindex="-1"></textarea>
</body></html>`;
}

const FORM = page(PITCH_BLOCK);

/** The pre-rename shape: a different hook, a different label, a textarea named `comment`. */
const LEGACY_FORM = page(`
  <div data-testid="pitchThirdPersonLabel">
    <label for="comment"><span><span class="inline-flex">Relevant experience<div data-testid="infoIcon"><svg viewBox="0 0 16 16"><path d="M8 16"></path></svg></div></span> (optional)</span></label>
    <textarea id="comment" name="comment" placeholder="Type here..."></textarea>
    <textarea aria-hidden="true" readonly tabindex="-1"></textarea>
  </div>`);

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

    expect(pitch.locator).toEqual({ by: 'name', value: 'pitch' });
  });

  /**
   * Not "Write your third-person pitch here". This string is the drafts map key and the
   * {#each} key in the panel, so it must not move when Toptal rewords a label — which is
   * exactly what Toptal did to the old "Relevant experience" wording.
   */
  it('names the pitch by a stable label rather than by the page wording', () => {
    const [, , , pitch] = extractApplicationFields(FORM);

    expect(pitch.question).toBe('Third-person pitch');
  });

  // Toptal refuses a shorter pitch, so the panel has to warn before the user tries to submit.
  it('reads the minimum length the page prints beside the pitch box', () => {
    const [, , , pitch] = extractApplicationFields(FORM);

    expect(pitch.minChars).toBe(180);
  });

  it('falls back to the known minimum when the page does not print one', () => {
    const [, , , pitch] = extractApplicationFields(
      FORM.replace('<p>Write minimum 180 characters</p>', ''),
    );

    expect(pitch.minChars).toBe(PITCH_MIN_CHARS);
  });

  // A question has no stated floor, and warning about one would be inventing a rule.
  it('states no minimum for anything but the pitch', () => {
    const fields = extractApplicationFields(FORM);

    expect(fields.filter((f) => f.kind !== 'pitch').map((f) => f.minChars)).toEqual([0, 0, 0]);
  });

  // The hook Toptal shipped before the rename. Kept because we cannot know which build an
  // account is served, and a dead selector is what made the pitch invisible in the first place.
  it('still finds the pitch behind the pre-rename hook', () => {
    const [, , , pitch] = extractApplicationFields(LEGACY_FORM);

    expect(pitch.kind).toBe('pitch');
    expect(pitch.locator).toEqual({ by: 'name', value: 'comment' });
    expect(pitch.question).toBe('Third-person pitch');
  });

  /**
   * The next rename must not make the pitch vanish silently again. A fillable textarea inside
   * the form but outside the numbered questions is, structurally, the pitch.
   */
  it('recovers the pitch by shape when neither hook matches', () => {
    const [, , , pitch] = extractApplicationFields(
      page('<div><label for="x">Your pitch</label><textarea id="x" name="x"></textarea></div>'),
    );

    expect(pitch.kind).toBe('pitch');
    expect(pitch.locator).toEqual({ by: 'name', value: 'x' });
    expect(pitch.unfillableReason).toBe('');
  });

  // Guessing between two would risk writing a pitch into the wrong box, which is the worst
  // thing this feature could do — so it is named as unfillable and the user writes it.
  it('refuses in words when more than one box could be the pitch', () => {
    const fields = extractApplicationFields(
      page('<div><textarea name="a"></textarea><textarea name="b"></textarea></div>'),
    );
    const pitch = fields.find((f) => f.kind === 'pitch');

    expect(pitch?.locator).toBeNull();
    expect(pitch?.unfillableReason).toMatch(/could not be identified/);
  });

  // Plenty of Toptal applications have no pitch box. Warning there would be a false alarm
  // about a page behaving exactly as it should.
  it('says nothing when the form simply has no pitch box', () => {
    const fields = extractApplicationFields(page(''));

    expect(fields.some((f) => f.kind === 'pitch')).toBe(false);
    expect(fields).toHaveLength(3);
  });

  // The dropdown is a readonly input plus a hidden field, driven by React state. Writing to
  // either does nothing the form will read, so offering to fill it would be a lie.
  it('refuses the dropdown question in words, and keeps what it is already set to', () => {
    const [choice] = extractApplicationFields(FORM);

    expect(choice.locator).toBeNull();
    expect(choice.unfillableReason).toMatch(/dropdown/);
    expect(choice.prefilled).toBe('Immediately');
  });

  // The autosize twin carries the same classes as the real control — and on the legacy markup
  // it is a sibling, so a naive querySelector('textarea') picks it. A value written there is
  // invisible to the user and to the form.
  it('never locates the aria-hidden measuring twin', () => {
    for (const html of [FORM, LEGACY_FORM]) {
      const fields = extractApplicationFields(html);
      const located = fields.filter((f) => f.locator).map((f) => JSON.stringify(f.locator));

      expect(new Set(located).size).toBe(located.length);
      expect(located).toHaveLength(3);
    }
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
