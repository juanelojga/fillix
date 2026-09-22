import { describe, it, expect } from 'vitest';
import {
  buildNotePrompt,
  noteSystemPrompt,
  NOTE_VARIANT_COUNT,
  SPANISH_RULE,
} from '../note-prompt';

const INSTRUCTIONS = '## Sobre ella\n\nLe digo Chiqui.';

describe('noteSystemPrompt', () => {
  /**
   * The one rule that must never be lost. First, so it survives a context cut from the end;
   * last, because later rules dominate earlier ones for small models — and in both languages,
   * so it reads as the instruction in the language the answer has to be in.
   */
  it('states the Spanish rule on the first line and on the last line', () => {
    const lines = noteSystemPrompt(INSTRUCTIONS).split('\n');
    expect(lines[0]).toBe(SPANISH_RULE);
    expect(lines[lines.length - 1]).toContain(SPANISH_RULE);
    expect(SPANISH_RULE).toMatch(/español/);
    expect(SPANISH_RULE).toMatch(/Spanish/);
  });

  it('keeps the Spanish rule even when the instructions are blank', () => {
    const prompt = noteSystemPrompt('');
    expect(prompt.startsWith(SPANISH_RULE)).toBe(true);
    expect(prompt.endsWith(SPANISH_RULE)).toBe(true);
  });

  it('puts the instructions between the fences', () => {
    const prompt = noteSystemPrompt(INSTRUCTIONS);
    const open = prompt.indexOf('=== Standing instructions ===');
    const close = prompt.indexOf('=== end ===');
    const body = prompt.indexOf('Le digo Chiqui.');
    expect(open).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(body);
  });

  it('asks for the count it will parse, and the envelope the parser reads', () => {
    const prompt = noteSystemPrompt(INSTRUCTIONS);
    expect(prompt).toContain(`Write exactly ${NOTE_VARIANT_COUNT} messages`);
    expect(prompt).toContain('{"messages":[');
  });

  it('fixes the shape a chat message has, not the tone', () => {
    const prompt = noteSystemPrompt(INSTRUCTIONS);
    expect(prompt).toMatch(/2 to 5 sentences/);
    expect(prompt).toMatch(/no subject line/);
    expect(prompt).toMatch(/No emoji unless/);
  });
});

describe('buildNotePrompt', () => {
  it('fills the seed slot rather than leaving it blank when nothing was typed', () => {
    expect(buildNotePrompt('   ')).toContain('No seed was given');
    expect(buildNotePrompt('')).toContain('Spanish');
  });

  it('includes the trimmed seed, and says the seed may be in any language', () => {
    const prompt = buildNotePrompt('  her exam went well  ');
    expect(prompt).toContain('her exam went well');
    expect(prompt).not.toContain('  her exam');
    expect(prompt).toContain('the messages are in Spanish');
  });
});
