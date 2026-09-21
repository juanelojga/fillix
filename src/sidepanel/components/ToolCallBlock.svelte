<script lang="ts">
  import { slide } from 'svelte/transition';

  interface Props {
    toolName: string;
    args: Record<string, string>;
    result: string | null;
  }

  let { toolName, args, result }: Props = $props();

  // `query` by name rather than by position: tavily_search is the first tool that can arrive with
  // several args, and the order of keys in the model's JSON is its own whim.
  const primaryArg = $derived(args['query'] ?? Object.values(args)[0] ?? '');
  let expanded = $state(false);

  const isError = $derived(result?.startsWith('Error:') ?? false);
  const isPending = $derived(result === null);

  type ToolConfig = { label: string; color: string };
  const TOOLS: Record<string, ToolConfig> = {
    wikipedia:  { label: 'Wikipedia', color: '#fbbf24' },
    news_feed:  { label: 'News', color: '#f87171' },
    fetch_url:  { label: 'Fetch', color: '#4ade80' },
    profile_search:       { label: 'Profile', color: '#60a5fa' },
    meeting_availability: { label: 'Hours',   color: '#60a5fa' },
    tavily_search:        { label: 'Search',  color: '#22d3ee' },
  };
  const tool = $derived(TOOLS[toolName] ?? { label: toolName, color: '#a78bfa' });

  type ListItem = { title: string; snippet: string; url: string; domain: string };
  type SearchHit = { title: string; url: string; domain: string; snippet: string };
  type WikiData = { extract: string; url: string };
  type ProfileData = { headings: string[]; text: string };

  function domain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  function shortDate(raw: string): string {
    try {
      return new Date(raw).toLocaleDateString('en', { month: 'short', day: 'numeric' });
    } catch { return raw; }
  }

  function parseList(text: string): ListItem[] {
    return text.split('\n')
      .filter(l => l.trim())
      .flatMap(line => {
        const m = line.match(/^\d+\. (.+?) — (.+) \((.+?)\)$/);
        if (!m) return [];
        const [, title, snippet, url] = m;
        return [{ title, snippet, url, domain: domain(url) }];
      });
  }

  /**
   * The `##` headings the retrieved sections carry, shown as chips.
   *
   * A chat reply is free-form streamed prose with no JSON envelope, so nothing can enforce a
   * citation the way `draft-answer.ts` discards a draft whose `drew_on` is empty. Surfacing
   * the headings is what makes the grounding checkable instead: what the model was shown is
   * one click away from what it wrote.
   */
  /**
   * The three-line blocks `tavily/search-results.ts` emits: `N. Title`, then the URL (with an
   * optional ` · date`), then the snippet.
   *
   * Deliberately not `parseList`, whose one-line format has a lazy title group — a web result
   * titled "Vue 3 — the Composition API guide" would render as "Vue 3" with the rest folded into
   * the snippet. Page titles carry dashes and parentheses constantly. Reading the URL off its own
   * line makes the parse survive any title at all.
   */
  function parseSearch(text: string): SearchHit[] {
    return text.split(/\n\s*\n/)
      .flatMap(block => {
        const [head, location, ...rest] = block.split('\n');
        const m = head?.match(/^\d+\. (.+)$/);
        if (!m || !location) return [];
        const [url] = location.split(' · ');
        return [{ title: m[1], url, domain: domain(url), snippet: rest.join(' ').trim() }];
      });
  }

  function parseProfile(text: string): ProfileData {
    const headings = text.split('\n')
      .flatMap(line => {
        const m = line.match(/^##\s+(.+)$/);
        return m ? [m[1].trim()] : [];
      });
    return { headings, text };
  }

  function parseWiki(text: string): WikiData {
    const i = text.lastIndexOf('\n');
    return i >= 0 ? { extract: text.slice(0, i), url: text.slice(i + 1) } : { extract: text, url: '' };
  }

  const parsed = $derived.by((): ListItem[] | SearchHit[] | WikiData | ProfileData | null => {
    if (!result || isError) return null;
    if (toolName === 'tavily_search') return parseSearch(result);
    if (toolName === 'news_feed') return parseList(result);
    if (toolName === 'wikipedia') return parseWiki(result);
    if (toolName === 'profile_search') return parseProfile(result);
    return null;
  });

  function toggle() {
    if (!isPending) expanded = !expanded;
  }
</script>

<div class="tool-wrap" style="--c: {tool.color}">
  <button class="tool-head" onclick={toggle} disabled={isPending} aria-expanded={expanded}>
    <span class="dot" class:pulse={isPending}></span>
    <span class="lbl">{tool.label}</span>
    <span class="qry">{primaryArg}</span>
    {#if isPending}
      <span class="pending-dots">
        <span></span><span></span><span></span>
      </span>
    {:else}
      <span class="chevron" class:open={expanded}>›</span>
    {/if}
  </button>

  {#if expanded && !isPending}
    <div class="tool-body" transition:slide={{ duration: 160 }}>
      {#if isError}
        <p class="err">{result}</p>

      {:else if toolName === 'tavily_search' && Array.isArray(parsed) && parsed.length > 0}
        <ul class="search-list">
          {#each parsed as hit, i}
            <li class="search-row">
              <a href={hit.url} target="_blank" rel="noopener noreferrer" class="news-link">
                <span class="news-n">{String(i + 1).padStart(2, '0')}</span>
                <div class="news-body">
                  <span class="news-title">{hit.title}</span>
                  <span class="src-domain">{hit.domain}</span>
                  {#if hit.snippet}
                    <span class="src-snippet">{hit.snippet}</span>
                  {/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>

      {:else if toolName === 'news_feed' && Array.isArray(parsed)}
        <ul class="news-list">
          {#each parsed as item, i}
            <li class="news-row">
              <a href={item.url} target="_blank" rel="noopener noreferrer" class="news-link">
                <span class="news-n">{String(i + 1).padStart(2, '0')}</span>
                <div class="news-body">
                  <span class="news-title">{item.title}</span>
                  <span class="news-date">{shortDate(item.snippet)}</span>
                </div>
              </a>
            </li>
          {/each}
        </ul>

      {:else if toolName === 'profile_search' && parsed && 'headings' in parsed}
        <div class="profile-wrap">
          {#if parsed.headings.length}
            <ul class="chips">
              {#each parsed.headings as heading}
                <li class="chip">{heading}</li>
              {/each}
            </ul>
          {/if}
          <pre class="raw-text">{parsed.text}</pre>
        </div>

      {:else if toolName === 'wikipedia' && parsed && 'extract' in parsed}
        <blockquote class="wiki-quote">
          <p>{parsed.extract}</p>
          {#if parsed.url}
            <a href={parsed.url} target="_blank" rel="noopener noreferrer" class="wiki-link">
              Read on Wikipedia →
            </a>
          {/if}
        </blockquote>

      {:else}
        <div class="raw-wrap">
          {#if toolName === 'fetch_url'}
            <span class="raw-domain">{primaryArg}</span>
          {/if}
          <pre class="raw-text">{result}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-wrap {
    margin-top: 5px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    background: color-mix(in srgb, var(--c) 5%, transparent);
    font-size: 11px;
    overflow: hidden;
  }

  /* ── Header ── */
  .tool-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    text-align: left;
  }
  .tool-head:disabled { cursor: default; }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    flex-shrink: 0;
  }
  .dot.pulse { animation: dot-pulse 1.2s ease-in-out infinite; }

  .lbl {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--c);
    flex-shrink: 0;
  }

  .qry {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground, #888);
  }

  .chevron {
    color: var(--muted-foreground, #888);
    font-size: 15px;
    line-height: 1;
    transition: transform 180ms ease;
    flex-shrink: 0;
  }
  .chevron.open { transform: rotate(90deg); }

  .pending-dots {
    display: flex;
    gap: 3px;
    align-items: center;
    flex-shrink: 0;
  }
  .pending-dots span {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--c);
    animation: dot-pulse 1s ease-in-out infinite;
  }
  .pending-dots span:nth-child(2) { animation-delay: 0.2s; }
  .pending-dots span:nth-child(3) { animation-delay: 0.4s; }

  /* ── Body ── */
  .tool-body {
    border-top: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
    padding: 7px 9px;
    overflow: hidden;
  }

  .err {
    margin: 0;
    color: #f87171;
  }


  /* news_feed */
  .news-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .news-row + .news-row {
    border-top: 1px solid color-mix(in srgb, var(--border, #333) 80%, transparent);
  }

  .news-link {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 4px;
    text-decoration: none;
    color: inherit;
    border-radius: 4px;
    transition: background 100ms;
  }
  .news-link:hover { background: color-mix(in srgb, var(--c) 12%, transparent); }

  .news-n {
    font-size: 9px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--c);
    flex-shrink: 0;
    padding-top: 1px;
    letter-spacing: 0.05em;
  }

  .news-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .news-title {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--foreground, #f0f0f0);
  }

  .news-date {
    font-size: 9px;
    color: var(--muted-foreground, #888);
    letter-spacing: 0.03em;
  }

  /* tavily_search — reuses the news row's link chrome; the sub-label is where a result came
     from rather than when, because a search result's date already rides in its snippet. */
  .search-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .search-row + .search-row {
    border-top: 1px solid color-mix(in srgb, var(--border, #333) 80%, transparent);
  }

  .src-domain {
    font-size: 9px;
    color: var(--c);
    letter-spacing: 0.03em;
  }

  .src-snippet {
    font-size: 10px;
    line-height: 1.45;
    color: var(--muted-foreground, #888);
  }

  /* wikipedia */
  .wiki-quote {
    margin: 0;
    padding: 0 0 0 10px;
    border-left: 2px solid var(--c);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .wiki-quote p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--foreground, #f0f0f0);
    font-style: italic;
  }

  .wiki-link {
    font-size: 10px;
    color: var(--c);
    text-decoration: none;
    letter-spacing: 0.03em;
    align-self: flex-start;
  }
  .wiki-link:hover { text-decoration: underline; }

  /* profile_search */
  .profile-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 10px;
    color: var(--c);
    border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }

  /* fetch_url */
  .raw-wrap {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .raw-domain {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--c);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .raw-text {
    margin: 0;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 10px;
    line-height: 1.5;
    color: var(--muted-foreground, #888);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    max-height: 160px;
    overflow-y: auto;
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
</style>
