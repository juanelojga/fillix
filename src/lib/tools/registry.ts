import type { SearchConfig } from '../../types';
import { fetchUrl } from './fetch-url';
import { newsFeed } from './news-feed';
import { webSearch } from './web-search';
import { wikipediaSummary } from './wikipedia';

export async function dispatchTool(
  name: string,
  args: Record<string, string>,
  searchConfig: SearchConfig,
): Promise<string> {
  switch (name) {
    case 'wikipedia':
      return wikipediaSummary(args['title'] ?? '');
    case 'fetch_url':
      return fetchUrl(args['url'] ?? '');
    case 'news_feed':
      return newsFeed(args['topic'] ?? '');
    case 'web_search':
      return webSearch(args['query'] ?? '', searchConfig.braveApiKey ?? '');
    default:
      return `Error: unknown tool "${name}"`;
  }
}
