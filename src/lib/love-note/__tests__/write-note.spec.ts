import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NOTE_NUM_CTX,
  NOTE_NUM_PREDICT,
  normalizeNoteVariants,
  writeNoteVariants,
} from '../write-note';

const CONFIG = { baseUrl: 'http://localhost:11434', model: 'gemma4:12b' };
const INSTRUCTIONS = '## Sobre ella\n\nLe digo Chiqui.';

const GOOD = {
  messages: ['Chiqui, ¿cómo te fue hoy?', 'Oye, hoy pensé en ti.', 'Te extraño un montón.'],
};

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => ({ response: JSON.stringify(body) }) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(reply(GOOD));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(): { system: string; prompt: string; options?: Record<string, number> } {
  return JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
}

describe('writeNoteVariants', () => {
  it('sends explicit num_ctx and num_predict — Ollama defaults to 2048 and eats the rule first', async () => {
    await writeNoteVariants(CONFIG, 'her exam', INSTRUCTIONS, AbortSignal.timeout(1_000));
    expect(sentBody().options?.num_ctx).toBe(NOTE_NUM_CTX);
    expect(sentBody().options?.num_predict).toBe(NOTE_NUM_PREDICT);
  });

  it('puts the instructions in the system prompt and the seed in the user prompt', async () => {
    await writeNoteVariants(CONFIG, 'her exam', INSTRUCTIONS, AbortSignal.timeout(1_000));
    expect(sentBody().system).toContain('Le digo Chiqui.');
    expect(sentBody().prompt).toContain('her exam');
    expect(sentBody().prompt).not.toContain('Le digo Chiqui.');
  });

  it('returns the three messages', async () => {
    const out = await writeNoteVariants(CONFIG, '', INSTRUCTIONS, AbortSignal.timeout(1_000));
    expect(out).toEqual(GOOD.messages);
  });
});

describe('normalizeNoteVariants', () => {
  it('keeps only non-empty strings, trimmed', () => {
    const out = normalizeNoteVariants({
      messages: ['  Hola.  ', '', '   ', 7, null, { text: 'no' }, 'Chao.'],
    });
    expect(out).toEqual(['Hola.', 'Chao.']);
  });

  it('drops a duplicate that differs only in case or spacing', () => {
    const out = normalizeNoteVariants({ messages: ['Te extraño.', '  te   EXTRAÑO. '] });
    expect(out).toHaveLength(1);
  });

  it('caps at the three that were asked for', () => {
    const many = Array.from({ length: 6 }, (_, i) => `Mensaje ${i}`);
    expect(normalizeNoteVariants({ messages: many })).toHaveLength(3);
  });

  /**
   * Throws rather than returning []: an empty list is indistinguishable from "the model had
   * nothing to say", which is not what happened. The line is what `note-diagnostics.ts` matches.
   */
  it('throws when nothing survived, with the line the diagnostics arm matches', () => {
    expect(() => normalizeNoteVariants({})).toThrow(/no usable messages/i);
    expect(() => normalizeNoteVariants({ messages: [] })).toThrow(/no usable messages/i);
    expect(() => normalizeNoteVariants({ messages: 'one string' })).toThrow(/no usable messages/i);
    expect(() => normalizeNoteVariants({ messages: [1, null, '  '] })).toThrow(
      /no usable messages/i,
    );
  });
});
