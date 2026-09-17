// @vitest-environment jsdom
// writeFields runs against a real DOM — that is the whole subject of this file.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const executeScript = vi.fn();
// Stubbed before the import, as the other capture specs do: the module reads chrome at call
// time, but the import must not find it missing.
vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });

const { fillActiveTab, writeFields } = await import('../fill-active-tab');

const ANCHOR = '[data-testid="matcherQuestions"]';
const REQUIREMENT = {
  accepts: (url: string) => url.startsWith('https://ok'),
  expected: 'a job page',
};

function page(): void {
  document.body.innerHTML = `
    <form>
      <div data-testid="matcherQuestions">
        <textarea id="q1" name="q1"></textarea>
        <textarea aria-hidden="true" readonly name="q1"></textarea>
        <textarea id="q2" name="q2"></textarea>
        <input id="plain" name="plain" type="text" />
        <input id="box" name="box" type="checkbox" />
        <button type="submit" data-testid="submitApplication">Submit Application</button>
      </div>
    </form>
    <form><textarea id="other" name="other"></textarea></form>`;
}

describe('writeFields', () => {
  beforeEach(page);

  it('writes each value into the control its locator names', () => {
    const outcomes = writeFields(
      [
        { locator: { by: 'name', value: 'q1' }, value: 'First.' },
        { locator: { by: 'id', value: 'q2' }, value: 'Second.' },
      ],
      ANCHOR,
    );

    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect((document.getElementById('q1') as HTMLTextAreaElement).value).toBe('First.');
    expect((document.getElementById('q2') as HTMLTextAreaElement).value).toBe('Second.');
  });

  /**
   * The measuring twin is a sibling carrying the *same name*, so `getElementsByName` returns it
   * too — and a value written there is invisible to both the user and the form.
   */
  it('never writes into the aria-hidden measuring twin', () => {
    writeFields([{ locator: { by: 'name', value: 'q1' }, value: 'First.' }], ANCHOR);

    const twin = document.querySelector('textarea[aria-hidden="true"]') as HTMLTextAreaElement;
    expect(twin.value).toBe('');
    expect((document.getElementById('q1') as HTMLTextAreaElement).value).toBe('First.');
  });

  /**
   * React installs a `_valueTracker` on controlled inputs. A direct `el.value = text` updates
   * that tracker as a side effect, so React compares the new value against it, sees no change,
   * and drops the event — the box shows the text and the form submits empty. Going through the
   * prototype setter bypasses the tracker, which is the whole reason `setFieldValue` could not
   * simply be reused here.
   */
  it('assigns through the prototype setter so a React value tracker sees the change', () => {
    const el = document.getElementById('q1') as HTMLTextAreaElement;
    const direct: string[] = [];
    // Stand-in for React's `_valueTracker`, which patches the node's own `value` accessor. A
    // naive `el.value = text` goes through this and updates the tracker as a side effect, so
    // React then sees no change and drops the input event. The prototype setter does not.
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => '',
      set: (v: string) => direct.push(v),
    });

    writeFields([{ locator: { by: 'name', value: 'q1' }, value: 'First.' }], ANCHOR);

    expect(direct).toEqual([]);
  });

  it('dispatches input and change, bubbling, so a framework hears it', () => {
    const el = document.getElementById('q1') as HTMLTextAreaElement;
    const seen: string[] = [];
    document.addEventListener('input', () => seen.push('input'));
    document.addEventListener('change', () => seen.push('change'));

    writeFields([{ locator: { by: 'name', value: 'q1' }, value: 'First.' }], ANCHOR);

    expect(seen).toEqual(['input', 'change']);
    expect(el.value).toBe('First.');
  });

  it('reports a locator that matches nothing rather than writing elsewhere', () => {
    const outcomes = writeFields([{ locator: { by: 'name', value: 'gone' }, value: 'x' }], ANCHOR);

    expect(outcomes).toEqual([
      { locator: { by: 'name', value: 'gone' }, ok: false, reason: 'not-found' },
    ]);
  });

  it('refuses a control that is not a text box', () => {
    const outcomes = writeFields([{ locator: { by: 'id', value: 'box' }, value: 'x' }], ANCHOR);

    expect(outcomes[0]).toMatchObject({ ok: false, reason: 'not-fillable' });
    expect((document.getElementById('box') as HTMLInputElement).value).not.toBe('x');
  });

  // It cannot reach one — a submit button is neither an input nor a textarea — and the test
  // exists so that stays true if the element filter is ever widened.
  it('cannot target the submit button', () => {
    const outcomes = writeFields([{ locator: { by: 'ordinal', index: 99 }, value: 'x' }], ANCHOR);

    expect(outcomes[0]).toMatchObject({ ok: false, reason: 'not-found' });
    expect(document.querySelector('[data-testid="submitApplication"]')).toBeTruthy();
  });

  describe('the ordinal fallback', () => {
    /**
     * The parser counted fields inside the application form, so this has to count inside the
     * same one. Counting document-wide would land on the other form's textarea.
     */
    it('counts within the form the anchor belongs to', () => {
      writeFields([{ locator: { by: 'ordinal', index: 0 }, value: 'First.' }], ANCHOR);

      expect((document.getElementById('q1') as HTMLTextAreaElement).value).toBe('First.');
      expect((document.getElementById('other') as HTMLTextAreaElement).value).toBe('');
    });

    it('skips the measuring twin when counting, as the parser did', () => {
      writeFields([{ locator: { by: 'ordinal', index: 1 }, value: 'Second.' }], ANCHOR);

      expect((document.getElementById('q2') as HTMLTextAreaElement).value).toBe('Second.');
    });

    it('falls back to the whole document when the anchor is gone', () => {
      document.body.innerHTML = '<textarea id="lonely"></textarea>';

      writeFields([{ locator: { by: 'ordinal', index: 0 }, value: 'x' }], ANCHOR);

      expect((document.getElementById('lonely') as HTMLTextAreaElement).value).toBe('x');
    });
  });
});

describe('fillActiveTab', () => {
  beforeEach(() => {
    query
      .mockReset()
      .mockResolvedValue([{ id: 7, url: 'https://ok/job', title: 'Job', status: 'complete' }]);
    executeScript.mockReset().mockResolvedValue([{ result: [] }]);
  });

  const REQUESTS = [{ locator: { by: 'name' as const, value: 'q1' }, value: 'x' }];

  it('injects into the active tab with the requests and the anchor', async () => {
    executeScript.mockResolvedValue([{ result: [{ locator: REQUESTS[0].locator, ok: true }] }]);

    const result = await fillActiveTab(REQUIREMENT, REQUESTS, ANCHOR);

    expect(result).toEqual({ ok: true, outcomes: [{ locator: REQUESTS[0].locator, ok: true }] });
    expect(executeScript.mock.calls[0][0].args).toEqual([REQUESTS, ANCHOR]);
    expect(executeScript.mock.calls[0][0].target).toEqual({ tabId: 7 });
  });

  /**
   * The user may have switched tabs between drafting and pressing Fill. Writing a pitch into
   * whatever happens to be open now is the worst thing this feature could do, so the
   * requirement is re-checked here and not merely at capture time.
   */
  it('refuses to write to a page the playbook does not claim', async () => {
    query.mockResolvedValue([{ id: 7, url: 'https://elsewhere', title: 'X', status: 'complete' }]);

    const result = await fillActiveTab(REQUIREMENT, REQUESTS, ANCHOR);

    expect(result).toEqual({
      ok: false,
      reason: 'wrong-page',
      url: 'https://elsewhere',
      expected: 'a job page',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('refuses a page still loading, before injecting', async () => {
    query.mockResolvedValue([{ id: 7, url: 'https://ok/job', title: 'J', status: 'loading' }]);

    expect(await fillActiveTab(REQUIREMENT, REQUESTS, ANCHOR)).toMatchObject({
      reason: 'still-loading',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('reports an injection Chrome refused', async () => {
    executeScript.mockRejectedValue(new Error('Cannot access contents'));

    expect(await fillActiveTab(REQUIREMENT, REQUESTS, ANCHOR)).toMatchObject({
      reason: 'injection-failed',
      error: 'Cannot access contents',
    });
  });

  // A tab that navigates mid-injection resolves with an empty array rather than rejecting.
  it('reports a tab that went away mid-write', async () => {
    executeScript.mockResolvedValue([]);

    expect(await fillActiveTab(REQUIREMENT, REQUESTS, ANCHOR)).toMatchObject({
      reason: 'empty-result',
    });
  });

  it('does not touch the page at all when there is nothing to write', async () => {
    expect(await fillActiveTab(REQUIREMENT, [], ANCHOR)).toEqual({ ok: true, outcomes: [] });
    expect(query).not.toHaveBeenCalled();
  });
});
