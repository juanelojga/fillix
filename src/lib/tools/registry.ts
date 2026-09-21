import { fetchUrl } from './fetch-url';
import { meetingAvailability } from './meeting-availability';
import { newsFeed } from './news-feed';
import { profileSearch } from './profile-search';
import { tavilySearch } from './tavily-search';
import { wikipediaSummary } from './wikipedia';

export async function dispatchTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    // The one tool taking more than a single positional argument. A search is a query plus
    // optional narrowing — topic, recency, domains — and deciding which of those the model may
    // set, and how forgiving to be about what it actually emitted, is `tavily/search-args.ts`'s
    // job rather than the router's. Passing the record through keeps that judgment in one place.
    case 'tavily_search':
      return tavilySearch(args);
    case 'wikipedia':
      return wikipediaSummary(args['title'] ?? '');
    case 'fetch_url':
      return fetchUrl(args['url'] ?? '');
    case 'news_feed':
      return newsFeed(args['topic'] ?? '');
    case 'profile_search':
      return profileSearch(args['query'] ?? '');
    // The one tool that takes no arguments: there is nothing to narrow, the stored week is
    // small enough to return whole, and a query would only invite the model to invent one.
    case 'meeting_availability':
      return meetingAvailability();
    default:
      return `Error: unknown tool "${name}"`;
  }
}
