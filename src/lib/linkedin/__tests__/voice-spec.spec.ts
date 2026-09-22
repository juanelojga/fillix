import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.stubGlobal('chrome', { storage: { local: { get: mockGet, set: mockSet } } });

const { DEFAULT_VOICE_SPEC, getVoiceSpec, resetVoiceSpec, setVoiceSpecOverride } =
  await import('../voice-spec');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('voice spec', () => {
  it('bundles the packaged file, so there is no fetch and no web_accessible_resource', () => {
    expect(DEFAULT_VOICE_SPEC).toContain('## Content pillars');
    expect(DEFAULT_VOICE_SPEC).toBe(DEFAULT_VOICE_SPEC.trim());
  });

  it('falls back to the packaged file when nothing is stored', async () => {
    mockGet.mockResolvedValue({});
    expect(await getVoiceSpec()).toBe(DEFAULT_VOICE_SPEC);
  });

  it('falls back when the stored value is only whitespace', async () => {
    mockGet.mockResolvedValue({ linkedinConfig: { voiceSpec: '   \n  ' } });
    expect(await getVoiceSpec()).toBe(DEFAULT_VOICE_SPEC);
  });

  it('returns the override when there is one', async () => {
    mockGet.mockResolvedValue({ linkedinConfig: { voiceSpec: 'I write short.' } });
    expect(await getVoiceSpec()).toBe('I write short.');
  });

  /**
   * The invariant `system-prompt.spec.ts` pins for the chat prompt, ported. If storage ever
   * held a copy of the packaged text, a later edit to `linkedin-voice.md` would silently stop
   * reaching anyone who had once opened the editor.
   */
  it('never writes a copy of the packaged text into storage', async () => {
    await setVoiceSpecOverride('   ');
    expect(mockSet).toHaveBeenCalledWith({ linkedinConfig: { voiceSpec: '' } });
    expect(JSON.stringify(mockSet.mock.calls)).not.toContain('## Content pillars');
  });

  it('trims what it stores', async () => {
    await setVoiceSpecOverride('  I write short.  ');
    expect(mockSet).toHaveBeenCalledWith({ linkedinConfig: { voiceSpec: 'I write short.' } });
  });

  it('resets by clearing, not by writing the default back', async () => {
    await resetVoiceSpec();
    expect(mockSet).toHaveBeenCalledWith({ linkedinConfig: { voiceSpec: '' } });
  });
});
