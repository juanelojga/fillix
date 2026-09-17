import type { PageRequirement } from '../capture/active-tab-html';

const HOST = 'talent.toptal.com';
const PREFIX = '/portal/job/';

/**
 * A Toptal job page: `https://talent.toptal.com/portal/job/<job-id>` with or without a
 * trailing step such as `/confirm`.
 *
 * Parsed rather than prefix-matched, the way `injectable-url.ts` does it: a raw
 * `startsWith` also accepts `https://talent.toptal.com.example.com/portal/job/x`, which is
 * a different site entirely. The id segment must be non-empty — `/portal/job/` on its own
 * is the router's own dead end, with no job on it to read.
 */
export function isToptalJobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== HOST) return false;
  if (!parsed.pathname.startsWith(PREFIX)) return false;

  const [id] = parsed.pathname.slice(PREFIX.length).split('/');
  return id.length > 0;
}

/** What `captureActiveTabHtml` refuses on, and the phrase its refusal names. */
export const TOPTAL_JOB_PAGE: PageRequirement = {
  accepts: isToptalJobUrl,
  expected: 'a Toptal job page — https://talent.toptal.com/portal/job/…',
};
