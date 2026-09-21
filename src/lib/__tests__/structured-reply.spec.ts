import { describe, it, expect } from 'vitest';
import { describeRawReply, parseStructuredReply } from '../structured-reply';

/** The shape the bug arrives in: `format: 'json'` output that stopped mid-string. */
const CUT_OFF =
  '{"text":"I have extensive experience building production AI systems, including AIEc';

function messageOf(raw: string, doneReason?: string): string {
  try {
    parseStructuredReply(raw, doneReason);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected parseStructuredReply to throw');
}

describe('parseStructuredReply', () => {
  it('reads well-formed JSON unchanged', () => {
    expect(parseStructuredReply('{"text":"Eight years.","drew_on":["Python"]}', 'stop')).toEqual({
      text: 'Eight years.',
      drew_on: ['Python'],
    });
  });

  /**
   * Parse first, classify second. A model can finish a complete object and only then hit the cap,
   * so `done_reason: 'length'` is not a failure on its own — reading it before parsing would turn
   * working drafts into red cards, which is the easiest way to get this module wrong.
   */
  it('returns the object when the model hit the cap but had already finished the JSON', () => {
    expect(parseStructuredReply('{"text":"Done."}', 'length')).toEqual({ text: 'Done.' });
  });

  // The salvage that was already here and had no test of its own.
  it('still strips a code fence a model wrapped the object in', () => {
    expect(parseStructuredReply('```json\n{"text":"Hi"}\n```', 'stop')).toEqual({ text: 'Hi' });
  });

  it('still recovers an object buried in surrounding prose', () => {
    expect(parseStructuredReply('Sure! {"text":"Hi"} Hope that helps.', 'stop')).toEqual({
      text: 'Hi',
    });
  });

  /**
   * The whole point of the module. Both inputs are identical and unparseable; only `done_reason`
   * says which failure it was, and the two need different next steps from the user.
   */
  it('names a cut-off generation as cut off when Ollama says it ran out of room', () => {
    expect(messageOf(CUT_OFF, 'length')).toMatch(/cut off before it finished/i);
    expect(messageOf(CUT_OFF, 'length').split('\n')[0]).not.toMatch(/invalid JSON/i);
  });

  it('calls complete-but-malformed output invalid JSON', () => {
    expect(messageOf('{oops}', 'stop')).toMatch(/invalid JSON/i);
  });

  /**
   * Older servers omit `done_reason`. An object that opens and never closes is a prefix as a
   * matter of fact rather than a guess, so it is still named correctly.
   */
  it('infers a cut-off from an object that never closes, with no done_reason to go on', () => {
    expect(messageOf(CUT_OFF)).toMatch(/cut off before it finished/i);
    expect(messageOf(CUT_OFF)).toMatch(/ends mid-object/);
  });

  it('does not call prose that never opened an object cut off', () => {
    expect(messageOf('I am sorry, I cannot help with that.')).toMatch(/invalid JSON/i);
  });

  it('reports how long the reply actually was', () => {
    expect(messageOf(CUT_OFF, 'length')).toMatch(new RegExp(`raw ${CUT_OFF.length} chars`));
  });

  /**
   * The failure this module exists to make diagnosable: the old message kept only the first 120
   * characters, so every report of it showed the same confident opening and nothing about where
   * the model stopped. The end is the part worth reading.
   */
  it('keeps the tail of a long reply, not just the head', () => {
    const message = messageOf(`{"text":"${'a'.repeat(900)}THE-VERY-END`, 'length');

    expect(message).toContain('THE-VERY-END');
    expect(message).toContain('{"text":"aaa');
  });

  it('bounds the message so one failure cannot fill the card', () => {
    expect(messageOf(`{"text":"${'a'.repeat(5000)}`, 'length').length).toBeLessThan(450);
  });

  /**
   * The guard that makes the wider excerpt safe. `draft-diagnostics.ts` checks its timeout and
   * model-missing arms before the JSON ones, so an answer that merely mentions either word would
   * be misdiagnosed if raw model text could reach the line those regexes read.
   */
  it('keeps model text off the cause line', () => {
    const raw = '{"text":"I fixed a request timeout and a not found error in checkout';
    const [causeLine] = messageOf(raw, 'length').split('\n');

    expect(causeLine).not.toMatch(/timeout/i);
    expect(causeLine).not.toMatch(/not found/i);
    expect(messageOf(raw, 'length')).toContain('request timeout');
  });
});

describe('describeRawReply', () => {
  it('collapses whitespace so a three-paragraph answer is not a wall', () => {
    expect(describeRawReply('{"text":"one\n\ntwo   three"')).toBe(
      'raw 26 chars · {"text":"one two three"',
    );
  });

  it('shows a short reply whole, with no elision', () => {
    expect(describeRawReply('{"a":1')).not.toContain('…');
  });
});
