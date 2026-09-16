import { fetchUrl } from './fetch-url';
import { newsFeed } from './news-feed';
import { wikipediaSummary } from './wikipedia';

export async function dispatchTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case 'wikipedia':
      return wikipediaSummary(args['title'] ?? '');
    case 'fetch_url':
      return fetchUrl(args['url'] ?? '');
    case 'news_feed':
      return newsFeed(args['topic'] ?? '');
    default:
      return `Error: unknown tool "${name}"`;
  }
}
