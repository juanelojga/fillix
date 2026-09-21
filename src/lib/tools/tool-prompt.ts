/**
 * The tool menu the model is shown, and the only module that decides whether a tool is advertised
 * at all.
 *
 * Lifted out of `chat-runner.ts`, which owns how the ReAct loop runs. The two change on different
 * schedules: this prose gets reworded every time a small model fails to emit a call in the shape
 * the parser expects, while the loop around it does not move. It stays in TS rather than
 * `src/prompts/` by the rule that file states — it defines the JSON envelope `detectToolCall`
 * parses, so changing it changes how the code reads the reply, which makes it a mechanism and not
 * a preference the user may override.
 *
 * `webSearch` is the first argument any of this has taken. `tavily_search` is withheld entirely
 * when no Tavily key is stored, rather than advertised and left to fail: a tool that can only
 * return an error still costs one of eight ReAct iterations, and a model that has been told it can
 * search will sometimes claim it did.
 */

export interface ToolPromptOptions {
  /** True when a Tavily API key is stored. */
  webSearch: boolean;
}

const PROFILE_RULES = `
profile_search and meeting_availability read the user's own CV and meeting hours, saved on this machine. Use them for any question about the user's experience, background, skills, projects or schedule — never answer those from memory. Everything they return is the user's own words, so address the user as "you". If profile_search reports the profile has no section covering something, say so plainly and do not fill the gap.
`.trim();

/**
 * Every optional argument is shown as a complete literal (`"topic":"news"`) rather than as a
 * `<placeholder>` naming a type, because a placeholder is what a small model echoes back verbatim.
 *
 * The clause about not writing "latest" into the query is the failure this paragraph exists to
 * prevent: Tavily ranks, it does not read intent, so `"query":"latest AI news today"` returns
 * whatever is most relevant to those words and not what is most recent.
 */
const WEB_SEARCH_RULES = `
tavily_search searches the live web and returns up to 5 ranked results, each as a title, a URL and a short snippet. Use it whenever the answer could have changed since your training data — versions, prices, releases, results, who currently holds a position — and whenever being out of date would make the answer wrong. Two optional arguments, both to be left out unless they help:
- recent events: add "topic":"news" together with "time_range":"day", "week", "month" or "year", instead of putting words like "latest" or "today" into the query.
- trusted sources only: add "sites":"arxiv.org,nature.com" to search those domains and nothing else.
The snippets are deliberately short. When one result is clearly the answer and you need more of it, call fetch_url on that result's URL on your next turn. Name the URLs you used in your reply so the user can check them. Never send the user's own details to tavily_search: anything about their experience, documents or schedule goes to profile_search and meeting_availability, which never leave this machine.
`.trim();

export function buildToolSystemPrompt({ webSearch }: ToolPromptOptions): string {
  // Listed first when present because it is the broadest tool and a small model reaches for the
  // first plausible entry. Which way that ordering cuts is not measurable in this repo — `eval/`
  // grades drafting, and nothing grades chat tool choice.
  const tools = [
    ...(webSearch
      ? ['- tavily_search → {"tool":"tavily_search","args":{"query":"<search words>"}}']
      : []),
    '- wikipedia  → {"tool":"wikipedia","args":{"title":"<article title>"}}',
    '- news_feed  → {"tool":"news_feed","args":{"topic":"<topic>"}}',
    '- fetch_url  → {"tool":"fetch_url","args":{"url":"<full URL>"}}',
    '- profile_search → {"tool":"profile_search","args":{"query":"<what to look up>"}}',
    '- meeting_availability → {"tool":"meeting_availability","args":{}}',
  ];

  return [
    '## Tools Available',
    'You have real-time web access via tool dispatch. When you need information from a URL or any external source, emit a tool call on its own line — never say you cannot access URLs or external resources:',
    '{"tool":"<name>","args":{...}}',
    'Stop generating. A result will be appended as a user message. Then continue.',
    'Available tools (use exact argument keys):',
    ...tools,
    'Only call one tool per turn. Never fabricate tool results.',
    '',
    ...(webSearch ? [WEB_SEARCH_RULES, ''] : []),
    PROFILE_RULES,
  ].join('\n');
}
