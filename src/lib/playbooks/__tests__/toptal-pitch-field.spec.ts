// @vitest-environment jsdom
// Every function here takes a live Element, which means a parsed document.
import { describe, it, expect } from 'vitest';
import { PITCH_MIN_CHARS, findFallbackPitch, pitchMinChars } from '../toptal-pitch-field';

function form(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<html><body><form>${inner}</form></body></html>`,
    'text/html',
  );
  const el = doc.querySelector('form');
  if (!el) throw new Error('fixture has no form');
  return el;
}

const QUESTIONS = `
  <div data-testid="matcherQuestions">
    <div data-testid="matcherQuestionInput"><textarea name="q1"></textarea></div>
    <div data-testid="matcherQuestionInput"><textarea name="q2"></textarea></div>
  </div>`;

describe('pitchMinChars', () => {
  // Toptal prints the number a couple of nodes below the box rather than inside it, so this
  // reads the wrapper's parent. Looser than a data-testid on purpose — the number is the
  // thing worth having, and a missed read costs a fallback rather than a wrong answer.
  it('reads the minimum the page prints beside the box', () => {
    const el = form(`
      <div>
        <div data-testid="pitchInput"><textarea name="pitch"></textarea></div>
        <div><p>Write minimum 180 characters</p></div>
      </div>`).querySelector('[data-testid="pitchInput"]');

    expect(pitchMinChars(el as Element)).toBe(180);
  });

  it('reads a number Toptal has since changed', () => {
    const el = form(`
      <div>
        <div data-testid="pitchInput"><textarea name="pitch"></textarea></div>
        <div><p>Write minimum 250 characters</p></div>
      </div>`).querySelector('[data-testid="pitchInput"]');

    expect(pitchMinChars(el as Element)).toBe(250);
  });

  // Warning with a stale number beats not warning at all, so this is the fallback rather
  // than 0 — Toptal will refuse a short pitch either way.
  it('falls back to the known floor when the prose is gone', () => {
    const el = form(
      '<div><div data-testid="pitchInput"><textarea name="pitch"></textarea></div></div>',
    ).querySelector('[data-testid="pitchInput"]');

    expect(pitchMinChars(el as Element)).toBe(PITCH_MIN_CHARS);
  });
});

describe('findFallbackPitch', () => {
  /**
   * The three cases the caller has to tell apart, which is why this returns the list rather
   * than the first match: none (the form genuinely has no pitch box — plenty do not), one
   * (that is it), several (guessing would write a pitch into the wrong box).
   */
  it('finds the one text box that is not a numbered question', () => {
    const found = findFallbackPitch(
      form(`${QUESTIONS}<div><textarea name="pitch"></textarea></div>`),
    );

    expect(found).toHaveLength(1);
    expect(found[0].getAttribute('name')).toBe('pitch');
  });

  it('finds nothing when every text box is a numbered question', () => {
    expect(findFallbackPitch(form(QUESTIONS))).toEqual([]);
  });

  it('reports every candidate when more than one could be the pitch', () => {
    const found = findFallbackPitch(
      form(`${QUESTIONS}<div><textarea name="a"></textarea><textarea name="b"></textarea></div>`),
    );

    expect(found).toHaveLength(2);
  });

  // The autosize measuring twin carries the same classes as the real control. A value
  // written there is invisible to the user and to the form.
  it('never offers the aria-hidden measuring twin', () => {
    const found = findFallbackPitch(
      form(
        `${QUESTIONS}<div><textarea name="pitch"></textarea><textarea aria-hidden="true" readonly></textarea></div>`,
      ),
    );

    expect(found).toHaveLength(1);
    expect(found[0].getAttribute('name')).toBe('pitch');
  });

  it('never offers a readonly box', () => {
    const found = findFallbackPitch(
      form(`${QUESTIONS}<div><textarea readonly name="x"></textarea></div>`),
    );

    expect(found).toEqual([]);
  });

  // A question wrapper that Toptal moved out of the matcherQuestions block is still a
  // question, and claiming it as the pitch would write the pitch over an answer.
  it('never offers a box that is still inside a question wrapper', () => {
    const found = findFallbackPitch(
      form('<div data-testid="matcherQuestionInput"><textarea name="q1"></textarea></div>'),
    );

    expect(found).toEqual([]);
  });
});
