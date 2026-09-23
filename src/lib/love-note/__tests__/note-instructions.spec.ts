import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.stubGlobal('chrome', { storage: { local: { get: mockGet, set: mockSet } } });

const {
  DEFAULT_NOTE_INSTRUCTIONS,
  getNoteInstructions,
  resetNoteInstructions,
  setNoteInstructionsOverride,
} = await import('../note-instructions');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('note instructions', () => {
  it('bundles the packaged file, so there is no fetch and no web_accessible_resource', () => {
    expect(DEFAULT_NOTE_INSTRUCTIONS).toContain('## Sobre ella');
    expect(DEFAULT_NOTE_INSTRUCTIONS).toBe(DEFAULT_NOTE_INSTRUCTIONS.trim());
  });

  /** The repo is public. The packaged file is a template; the real details live in storage. */
  it('ships placeholders, not a person', () => {
    expect(DEFAULT_NOTE_INSTRUCTIONS).toContain('[su apodo]');
    expect(DEFAULT_NOTE_INSTRUCTIONS).toContain('[su nombre]');
  });

  it('is written in Spanish, so the model sees no English prose beside the language rule', () => {
    expect(DEFAULT_NOTE_INSTRUCTIONS).toMatch(/^# Instrucciones/);
    expect(DEFAULT_NOTE_INSTRUCTIONS).toContain('## Tono');
  });

  it('falls back to the packaged file when nothing is stored', async () => {
    mockGet.mockResolvedValue({});
    expect(await getNoteInstructions()).toBe(DEFAULT_NOTE_INSTRUCTIONS);
  });

  it('falls back when the stored value is only whitespace', async () => {
    mockGet.mockResolvedValue({ loveNoteConfig: { instructions: '   \n  ' } });
    expect(await getNoteInstructions()).toBe(DEFAULT_NOTE_INSTRUCTIONS);
  });

  it('returns the override when there is one', async () => {
    mockGet.mockResolvedValue({ loveNoteConfig: { instructions: 'Le digo Chiqui.' } });
    expect(await getNoteInstructions()).toBe('Le digo Chiqui.');
  });

  it('never writes a copy of the packaged text into storage', async () => {
    await setNoteInstructionsOverride('   ');
    expect(mockSet).toHaveBeenCalledWith({ loveNoteConfig: { instructions: '' } });
    expect(JSON.stringify(mockSet.mock.calls)).not.toContain('## Sobre ella');
  });

  it('trims what it stores', async () => {
    await setNoteInstructionsOverride('  Le digo Chiqui.  ');
    expect(mockSet).toHaveBeenCalledWith({ loveNoteConfig: { instructions: 'Le digo Chiqui.' } });
  });

  it('resets by clearing, not by writing the default back', async () => {
    await resetNoteInstructions();
    expect(mockSet).toHaveBeenCalledWith({ loveNoteConfig: { instructions: '' } });
  });
});
