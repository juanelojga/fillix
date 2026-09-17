import { describe, it, expect } from 'vitest';
import { describeFillOutcome, summariseFill } from '../fill-outcome';
import type { FillOutcome } from '../fill-active-tab';

const NAMED = { by: 'name', value: 'q1' } as const;
const POSITION = { by: 'ordinal', index: 2 } as const;

describe('describeFillOutcome', () => {
  it('says nothing about a field that was written', () => {
    expect(describeFillOutcome({ locator: NAMED, ok: true })).toBe('');
  });

  it('tells the user to capture again when the field is gone', () => {
    const text = describeFillOutcome({ locator: NAMED, ok: false, reason: 'not-found' });

    expect(text).toMatch(/Couldn't find this field/);
    expect(text).toMatch(/press Capture again/);
  });

  // "The form has fewer fields than that now" is a different cause from "the field moved",
  // and the ordinal locator is the only one that can hit it.
  it('explains a positional miss differently from a named one', () => {
    const positional = describeFillOutcome({ locator: POSITION, ok: false, reason: 'not-found' });
    const named = describeFillOutcome({ locator: NAMED, ok: false, reason: 'not-found' });

    expect(positional).toMatch(/matched by position \(field 3\)/);
    expect(positional).not.toBe(named);
  });

  it('tells the user to fill a non-text control themselves', () => {
    const text = describeFillOutcome({ locator: NAMED, ok: false, reason: 'not-fillable' });

    expect(text).toMatch(/not a text box/);
    expect(text).toMatch(/yourself/);
  });
});

describe('summariseFill', () => {
  const ok = (i: number): FillOutcome => ({ locator: { by: 'name', value: `q${i}` }, ok: true });
  const bad = (i: number): FillOutcome => ({
    locator: { by: 'name', value: `q${i}` },
    ok: false,
    reason: 'not-found',
  });

  // The whole feature ends with the user pressing Submit, so the line that says it is done
  // has to say that too.
  it('says how many landed and that submitting is still the user’s move', () => {
    const text = summariseFill([ok(1), ok(2)]);

    expect(text).toMatch(/Filled 2 fields/);
    expect(text).toMatch(/submit the form yourself/);
  });

  it('counts one field in the singular', () => {
    expect(summariseFill([ok(1)])).toMatch(/Filled 1 field\./);
  });

  // A partial success must not read as a success: the misses are named per field, and this
  // line is what sends the user looking for them.
  it('says how many were missed and that they are named below', () => {
    expect(summariseFill([ok(1), bad(2), bad(3)])).toMatch(
      /Filled 1 of 3 fields — the rest are named below/,
    );
  });

  it('has something to say when there was nothing to do', () => {
    expect(summariseFill([])).toBe('Nothing to fill.');
  });
});
