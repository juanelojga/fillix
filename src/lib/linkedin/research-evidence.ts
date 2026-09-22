import type { NewsItem } from '../../types';
import type { SearchResult } from '../tavily/search';
import { RESEARCH_CHARS } from './post-budget';

/**
 * The research, as one block the model reads and one list the panel shows.
 *
 * Pure, and split from `topic-research.ts` the way `news/interleave.ts` is split from
 * `news/aggregator.ts`: what to fetch and how to survive a 503 is one reason to change, and
 * the shape of the block is another — and the shape is a contract, because the angle brief
 * cites a source by its number.
 */

export const RESEARCH_SNIPPET_CHARS = 300;

export interface ResearchSource {
  /** 1-based, and the number the spike statement cites. */
  n: number;
  origin: 'web' | 'hn';
  title: string;
  url: string;
  /** ISO date, or '' when the source is undateable — see below. */
  date: string;
}

/** Whitespace-flattened: a newline inside a title would split one block into two. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string, limit: number): string {
  const flat = flatten(text);
  return flat.length <= limit ? flat : `${flat.slice(0, limit).trimEnd()}…`;
}

/** An ISO day, or '' — the model has no clock, so a date it cannot read is worse than none. */
function isoDay(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
}

function block(source: ResearchSource, snippet: string): string {
  const dated = source.date ? `${source.url} · ${source.date}` : source.url;
  return [`[${source.n}] ${source.origin} · ${source.title}`, dated, snippet].join('\n');
}

/**
 * Round-robins the two sources, then budgets.
 *
 * `news/interleave.ts` is deliberately not reused. It is typed on `NewsItem`, and a
 * `SearchResult` has neither an `id` nor a `category` — reusing it would mean forging a
 * news-shaped identity for a web hit, and that coercion would be the bug. The round-robin
 * itself is four lines.
 *
 * The budget rules are `tavily/search-results.ts`'s, carried over because they were learned
 * the hard way there: a whole block is dropped rather than half of one, since half a block
 * loses the URL line and leaves `[3]` pointing at nothing — and the first block is kept even
 * when it alone overflows, by `profile/retrieve.ts`'s rule about its best chunk.
 */
export function buildResearchEvidence(
  web: SearchResult[],
  hn: NewsItem[],
): { evidence: string; sources: ResearchSource[] } {
  const pairs: { origin: 'web' | 'hn'; title: string; url: string; date: string; body: string }[] =
    [];

  for (let i = 0; i < Math.max(web.length, hn.length); i += 1) {
    const w = web[i];
    if (w) {
      pairs.push({
        origin: 'web',
        title: flatten(w.title),
        url: w.url,
        date: isoDay(w.publishedDate),
        body: w.content,
      });
    }
    const h = hn[i];
    if (h) {
      pairs.push({
        origin: 'hn',
        title: flatten(h.title),
        url: h.url,
        date: isoDay(h.publishedAt),
        body: h.snippet,
      });
    }
  }

  const sources: ResearchSource[] = [];
  const blocks: string[] = [];
  let used = 0;

  for (const pair of pairs) {
    const source: ResearchSource = {
      n: sources.length + 1,
      origin: pair.origin,
      title: pair.title,
      url: pair.url,
      date: pair.date,
    };
    const text = block(source, clip(pair.body, RESEARCH_SNIPPET_CHARS));
    const cost = used === 0 ? text.length : text.length + 2;

    // The first is kept whatever it costs: no research at all is the one outcome that makes
    // the model write from its training instead.
    if (used > 0 && used + cost > RESEARCH_CHARS) continue;

    sources.push(source);
    blocks.push(text);
    used += cost;
  }

  return { evidence: blocks.join('\n\n'), sources };
}
