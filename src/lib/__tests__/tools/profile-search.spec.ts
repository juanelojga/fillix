import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({
  getProfile: vi.fn(),
  getProfileConfig: vi.fn(),
  getProfileIndex: vi.fn(),
}));
vi.mock('../../profile/query-embed-direct', () => ({ embedQueryDirect: vi.fn() }));

import { profileSearch, PROFILE_SEARCH_CHARS } from '../../tools/profile-search';
import { getProfile, getProfileConfig, getProfileIndex } from '../../storage';
import { embedQueryDirect } from '../../profile/query-embed-direct';
import { hashProfile } from '../../profile/profile-hash';
import type { ProfileIndex } from '../../storage';

const MARKDOWN = '## Python\n\nEight years of Python.\n\n## React\n\nSix years of React.';
const MODEL = 'nomic-embed-text';

function freshIndex(markdown = MARKDOWN): ProfileIndex {
  return {
    hash: hashProfile(markdown, MODEL),
    chars: markdown.length,
    model: MODEL,
    dim: 2,
    builtAt: 1,
    chunks: [
      {
        id: 'python-0',
        heading: 'Python',
        ordinal: 0,
        text: '## Python\n\nEight years of Python.',
        vector: [1, 0],
      },
      {
        id: 'react-0',
        heading: 'React',
        ordinal: 1,
        text: '## React\n\nSix years of React.',
        vector: [0, 1],
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ markdown: MARKDOWN, updatedAt: 1 });
  vi.mocked(getProfileConfig).mockResolvedValue({ embedModel: MODEL });
  vi.mocked(getProfileIndex).mockResolvedValue(freshIndex());
  vi.mocked(embedQueryDirect).mockResolvedValue({ ok: true, vector: [1, 0] });
});

describe('profileSearch', () => {
  it('returns the retrieved sections joined by the evidence separator', async () => {
    const result = await profileSearch('Python experience');

    expect(result).toContain('## Python');
    expect(result).toContain('Eight years of Python.');
    expect(result.split('\n\n---\n\n').length).toBeGreaterThan(1);
    expect(result.startsWith('Error:')).toBe(false);
  });

  // Below drafting's EVIDENCE_CHARS on purpose: a tool result is appended to the conversation
  // and the ReAct loop runs up to eight times, so these accumulate across a turn.
  it('keeps the result inside the chat budget when sections are large', async () => {
    const big = '## A\n\n' + 'a'.repeat(2_000);
    const big2 = '## B\n\n' + 'b'.repeat(2_000);
    const markdown = `${big}\n\n${big2}`;
    vi.mocked(getProfile).mockResolvedValue({ markdown, updatedAt: 1 });
    vi.mocked(getProfileIndex).mockResolvedValue({
      hash: hashProfile(markdown, MODEL),
      chars: markdown.length,
      model: MODEL,
      dim: 2,
      builtAt: 1,
      chunks: [
        { id: 'a-0', heading: 'A', ordinal: 0, text: big, vector: [1, 0] },
        { id: 'b-0', heading: 'B', ordinal: 1, text: big2, vector: [0.9, 0.1] },
      ],
    });

    const result = await profileSearch('anything');

    expect(PROFILE_SEARCH_CHARS).toBeLessThan(6_000);
    expect(result.length).toBeLessThanOrEqual(PROFILE_SEARCH_CHARS);
    expect(result).toContain('## A');
    expect(result).not.toContain('## B');
  });

  it('refuses with a worded diagnosis when no embedding model is named', async () => {
    vi.mocked(getProfileConfig).mockResolvedValue({ embedModel: '' });

    const result = await profileSearch('Python');

    expect(result.startsWith('Error:')).toBe(true);
    expect(result).toContain('No embedding model chosen');
    expect(result).toContain('Profile tab');
    expect(embedQueryDirect).not.toHaveBeenCalled();
  });

  it('refuses when the profile is empty', async () => {
    vi.mocked(getProfile).mockResolvedValue({ markdown: '', updatedAt: 1 });

    const result = await profileSearch('Python');

    expect(result).toContain('Error: Your profile is empty');
  });

  it('refuses when there is no index', async () => {
    vi.mocked(getProfileIndex).mockResolvedValue(null);

    const result = await profileSearch('Python');

    expect(result).toContain('Error: Your profile has not been indexed');
  });

  it('refuses a stale index rather than ranking against vectors that no longer describe it', async () => {
    vi.mocked(getProfileIndex).mockResolvedValue(freshIndex('## Python\n\nRewritten since.'));

    const result = await profileSearch('Python');

    expect(result).toContain('Error: Your profile changed since it was indexed');
  });

  it('reports an embed failure as an error', async () => {
    vi.mocked(embedQueryDirect).mockResolvedValue({ ok: false, error: 'connection refused' });

    const result = await profileSearch('Python');

    expect(result).toContain("Error: Couldn't search your profile");
  });

  // The whole point of the three-way split: a profile that says nothing is NOT a failure, and
  // must not be worded as one. Collapsing the two is what `retrieveFromIndex` refuses early to
  // prevent.
  it('reports "nothing found" as plain text, never as an Error', async () => {
    // A query vector of a different width scores nothing — topChunks returns [].
    vi.mocked(embedQueryDirect).mockResolvedValue({ ok: true, vector: [1, 0, 0] });

    const result = await profileSearch('Python');

    expect(result.startsWith('Error:')).toBe(false);
    expect(result).toContain('no section covering that');
  });

  it('rejects a blank query without touching storage', async () => {
    const result = await profileSearch('   ');

    expect(result).toBe('Error: profile_search needs a "query" argument.');
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('never throws: a storage failure comes back as an Error string', async () => {
    vi.mocked(getProfileIndex).mockRejectedValue(new Error('storage unavailable'));

    await expect(profileSearch('Python')).resolves.toBe('Error: storage unavailable');
  });
});
