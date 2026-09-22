import type { NewsItem } from '../../types';
import { fetchHackerNews } from '../news/hacker-news';
import { searchWeb, type SearchResult } from '../tavily/search';
import { diagnoseTavilyFailure } from '../tavily/search-diagnostics';
import { buildResearchEvidence, type ResearchSource } from './research-evidence';

/**
 * What the web and Hacker News say about a topic right now.
 *
 * The impure half, and a sibling of `news/aggregator.ts` in every respect: two sources under
 * `Promise.allSettled` — never `all`, because a Tavily 429 must not discard the Hacker News
 * results that arrived — with a failed source named rather than hidden.
 */

export const RESEARCH_TIMEOUT_MS = 15_000;

/** How many Hacker News stories a topic is worth. Five, matching Tavily's fixed page. */
const HN_LIMIT = 5;
const HN_MIN_POINTS = 10;

export interface ResearchSourceFailure {
  origin: 'web' | 'hn';
  /** Wording we authored. Never Tavily's own message — it is the one string that could
   *  carry the API key somewhere it would be displayed. */
  summary: string;
  hint: string;
}

export interface TopicResearch {
  /** The one block the brief is grounded in, sources numbered `[1]`… */
  evidence: string;
  sources: ResearchSource[];
  /** Never thrown. A keyless install still researches; it just researches less. */
  degraded: ResearchSourceFailure[];
}

function tavilyFailure(error: string): ResearchSourceFailure {
  // Only `summary` and `hint`, the discipline `tools/tavily-search.ts` states: those are
  // strings we wrote, so Tavily's own message never leaves the worker.
  const { summary, hint } = diagnoseTavilyFailure(error, '/search');
  return { origin: 'web', summary, hint };
}

/**
 * `apiKey` is a parameter and `''` is the degrade path, not a refusal.
 *
 * Hacker News alone is enough to write a post from, and refusing without a key would make an
 * optional paid service mandatory for the whole playbook. The key is read from storage by
 * `background.ts`, so it never crosses `sendMessage`.
 *
 * One signal for both sources, so their clocks start together by construction rather than by
 * remembering to create them at the same moment.
 */
export async function researchTopic(
  apiKey: string,
  topic: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<TopicResearch> {
  const degraded: ResearchSourceFailure[] = [];

  const webTask: Promise<SearchResult[]> = apiKey
    ? searchWeb(apiKey, { query: topic, topic: 'general', timeRange: 'month' }, signal)
    : Promise.reject(new Error('No Tavily API key'));

  // `fetchHackerNews` directly, not `tools/news-feed.ts`: that wrapper returns "Error: …"
  // prose for a model and swallows the failure, which would land a source titled
  // "Error: Hacker News returned 503" inside the evidence.
  const hnTask = fetchHackerNews(
    'technology',
    { tags: 'story', query: topic, minPoints: HN_MIN_POINTS },
    signal,
    now,
  );

  const [webResult, hnResult] = await Promise.allSettled([webTask, hnTask]);

  let web: SearchResult[] = [];
  if (webResult.status === 'fulfilled') {
    web = webResult.value;
  } else {
    const raw =
      webResult.reason instanceof Error ? webResult.reason.message : String(webResult.reason);
    degraded.push(tavilyFailure(raw));
  }

  let hn: NewsItem[] = [];
  if (hnResult.status === 'fulfilled') {
    hn = hnResult.value.slice(0, HN_LIMIT);
  } else {
    // Hacker News has no diagnostics module, so the wording is here — `aggregator.ts` sets
    // the precedent of carrying the source's own message for this one.
    const raw =
      hnResult.reason instanceof Error ? hnResult.reason.message : String(hnResult.reason);
    degraded.push({
      origin: 'hn',
      summary: "Couldn't reach Hacker News",
      hint: `The post can still be written from the web results. ${raw}`,
    });
  }

  const { evidence, sources } = buildResearchEvidence(web, hn);
  return { evidence, sources, degraded };
}
