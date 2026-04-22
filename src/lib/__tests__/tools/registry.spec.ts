// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchTool } from '../../tools/registry';
import type { SearchConfig } from '../../../types';

vi.mock('../../tools/wikipedia', () => ({ wikipediaSummary: vi.fn() }));
vi.mock('../../tools/fetch-url', () => ({ fetchUrl: vi.fn() }));
vi.mock('../../tools/news-feed', () => ({ newsFeed: vi.fn() }));
vi.mock('../../tools/web-search', () => ({ webSearch: vi.fn() }));

import { wikipediaSummary } from '../../tools/wikipedia';
import { fetchUrl } from '../../tools/fetch-url';
import { newsFeed } from '../../tools/news-feed';
import { webSearch } from '../../tools/web-search';

const searchConfig: SearchConfig = { braveApiKey: 'bsak-test' };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('dispatchTool', () => {
  it('routes wikipedia to wikipediaSummary with title arg', async () => {
    vi.mocked(wikipediaSummary).mockResolvedValue('TypeScript is a language.');
    const result = await dispatchTool('wikipedia', { title: 'TypeScript' }, searchConfig);
    expect(wikipediaSummary).toHaveBeenCalledWith('TypeScript');
    expect(result).toBe('TypeScript is a language.');
  });

  it('routes fetch_url to fetchUrl with url arg', async () => {
    vi.mocked(fetchUrl).mockResolvedValue('Page content here.');
    const result = await dispatchTool('fetch_url', { url: 'https://example.com' }, searchConfig);
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com');
    expect(result).toBe('Page content here.');
  });

  it('routes news_feed to newsFeed with topic arg', async () => {
    vi.mocked(newsFeed).mockResolvedValue('1. Headline — date (url)');
    const result = await dispatchTool('news_feed', { topic: 'AI' }, searchConfig);
    expect(newsFeed).toHaveBeenCalledWith('AI');
    expect(result).toBe('1. Headline — date (url)');
  });

  it('routes web_search to webSearch with query arg and braveApiKey', async () => {
    vi.mocked(webSearch).mockResolvedValue('1. Result — url');
    const result = await dispatchTool('web_search', { query: 'AI news' }, searchConfig);
    expect(webSearch).toHaveBeenCalledWith('AI news', 'bsak-test');
    expect(result).toBe('1. Result — url');
  });

  it('passes empty string as braveApiKey when not configured', async () => {
    vi.mocked(webSearch).mockResolvedValue('Error: Brave Search API key not configured');
    await dispatchTool('web_search', { query: 'test' }, {});
    expect(webSearch).toHaveBeenCalledWith('test', '');
  });

  it('returns Error: unknown tool for unrecognised tool names', async () => {
    const result = await dispatchTool('magic_tool', { arg: 'val' }, searchConfig);
    expect(result).toBe('Error: unknown tool "magic_tool"');
  });
});
