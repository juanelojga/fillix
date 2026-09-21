// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchTool } from '../../tools/registry';

vi.mock('../../tools/wikipedia', () => ({ wikipediaSummary: vi.fn() }));
vi.mock('../../tools/fetch-url', () => ({ fetchUrl: vi.fn() }));
vi.mock('../../tools/news-feed', () => ({ newsFeed: vi.fn() }));
vi.mock('../../tools/profile-search', () => ({ profileSearch: vi.fn() }));
vi.mock('../../tools/meeting-availability', () => ({ meetingAvailability: vi.fn() }));

import { wikipediaSummary } from '../../tools/wikipedia';
import { fetchUrl } from '../../tools/fetch-url';
import { newsFeed } from '../../tools/news-feed';
import { profileSearch } from '../../tools/profile-search';
import { meetingAvailability } from '../../tools/meeting-availability';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('dispatchTool', () => {
  it('routes wikipedia to wikipediaSummary with title arg', async () => {
    vi.mocked(wikipediaSummary).mockResolvedValue('TypeScript is a language.');
    const result = await dispatchTool('wikipedia', { title: 'TypeScript' });
    expect(wikipediaSummary).toHaveBeenCalledWith('TypeScript');
    expect(result).toBe('TypeScript is a language.');
  });

  it('routes profile_search to profileSearch with the query arg', async () => {
    vi.mocked(profileSearch).mockResolvedValue('## Python\n\nEight years.');
    const result = await dispatchTool('profile_search', { query: 'Python experience' });
    expect(profileSearch).toHaveBeenCalledWith('Python experience');
    expect(result).toBe('## Python\n\nEight years.');
  });

  it('routes meeting_availability with no arguments at all', async () => {
    vi.mocked(meetingAvailability).mockResolvedValue('## Meeting availability');
    const result = await dispatchTool('meeting_availability', {});
    expect(meetingAvailability).toHaveBeenCalledWith();
    expect(result).toBe('## Meeting availability');
  });

  it('routes fetch_url to fetchUrl with url arg', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('Page content here.');
    const result = await dispatchTool('fetch_url', { url: 'https://example.com' });
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com');
    expect(result).toBe('Page content here.');
  });

  it('routes news_feed to newsFeed with topic arg', async () => {
    vi.mocked(newsFeed).mockResolvedValue('1. Headline — date (url)');
    const result = await dispatchTool('news_feed', { topic: 'AI' });
    expect(newsFeed).toHaveBeenCalledWith('AI');
    expect(result).toBe('1. Headline — date (url)');
  });

  // The retired web_search tool must stay unroutable — this fails loudly if the
  // case is ever re-added rather than silently restoring Brave Search.
  it('no longer routes web_search', async () => {
    const result = await dispatchTool('web_search', { query: 'AI news' });
    expect(result).toBe('Error: unknown tool "web_search"');
  });

  it('returns Error: unknown tool for unrecognised tool names', async () => {
    const result = await dispatchTool('magic_tool', { arg: 'val' });
    expect(result).toBe('Error: unknown tool "magic_tool"');
  });
});
