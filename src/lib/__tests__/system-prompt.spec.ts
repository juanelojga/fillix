import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_SYSTEM_PROMPT,
  getSystemPrompt,
  resetSystemPrompt,
  setSystemPromptOverride,
} from '../system-prompt';

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.stubGlobal('chrome', {
  storage: { local: { get: mockGet, set: mockSet } },
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DEFAULT_SYSTEM_PROMPT', () => {
  it('is inlined from the packaged markdown, not fetched at runtime', () => {
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe('string');
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('is trimmed, so concatenating it cannot introduce leading blank lines', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBe(DEFAULT_SYSTEM_PROMPT.trim());
  });
});

describe('getSystemPrompt', () => {
  it('falls back to the packaged default when storage has no chat key', async () => {
    mockGet.mockResolvedValue({});
    expect(await getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('returns the stored override when one is set', async () => {
    mockGet.mockResolvedValue({ chat: { systemPrompt: 'Answer only in haiku.' } });
    expect(await getSystemPrompt()).toBe('Answer only in haiku.');
  });

  // A user who clears the textarea means "go back to the default", not
  // "run with no system prompt at all".
  it('treats an empty override as no override', async () => {
    mockGet.mockResolvedValue({ chat: { systemPrompt: '' } });
    expect(await getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('treats a whitespace-only override as no override', async () => {
    mockGet.mockResolvedValue({ chat: { systemPrompt: '   \n\t ' } });
    expect(await getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('survives a chat key that is missing its systemPrompt field', async () => {
    mockGet.mockResolvedValue({ chat: {} });
    expect(await getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});

describe('setSystemPromptOverride', () => {
  it('writes the trimmed override to the chat key', async () => {
    mockGet.mockResolvedValue({});
    await setSystemPromptOverride('  Be terse.  ');
    expect(mockSet).toHaveBeenCalledWith({ chat: { systemPrompt: 'Be terse.' } });
  });

  // Storage must never hold a copy of the packaged text, or later edits to
  // system.md would silently stop reaching the user.
  it("stores '' for a blank override rather than the default text", async () => {
    mockGet.mockResolvedValue({});
    await setSystemPromptOverride('   ');
    expect(mockSet).toHaveBeenCalledWith({ chat: { systemPrompt: '' } });
  });
});

describe('resetSystemPrompt', () => {
  it("clears the override to ''", async () => {
    mockGet.mockResolvedValue({ chat: { systemPrompt: 'Old override' } });
    await resetSystemPrompt();
    expect(mockSet).toHaveBeenCalledWith({ chat: { systemPrompt: '' } });
  });

  it('leaves getSystemPrompt returning the packaged default afterwards', async () => {
    mockGet.mockResolvedValue({ chat: { systemPrompt: '' } });
    expect(await getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});
