import { diagnoseRetrievalFailure } from '../profile/retrieval-diagnostics';
import { embedQueryDirect } from '../profile/query-embed-direct';
import { retrieveFromIndex } from '../profile/profile-retrieval';
import { getProfile, getProfileConfig, getProfileIndex } from '../storage';

/**
 * The chat tool that reads the user's own CV.
 *
 * A thin orchestrator, like `playbooks/toptal.ts`: it gathers the three stored values the
 * refusals are decided from, hands them to `retrieveFromIndex` — the same function the
 * drafting path and the eval harness use, so there is one set of rules rather than two that
 * agree until they don't — and words the outcome for a tool result.
 *
 * Three outcomes, and keeping them apart is the whole point. An unusable index comes back as
 * an `Error:` naming the fix; a profile that genuinely says nothing about the query comes back
 * as a plain sentence. Collapsing those two is exactly what `retrieveFromIndex` refuses before
 * embedding in order to prevent: "your CV has nothing on this" is a very different thing to
 * tell someone than "your index is stale".
 */

/**
 * Well under drafting's `EVIDENCE_CHARS` of 6 000. A tool result is appended to the
 * conversation as a user message and the ReAct loop can run eight times, so results accumulate
 * across a turn in a way a single draft prompt never does.
 */
export const PROFILE_SEARCH_CHARS = 2_500;

const MAX_SECTIONS = 4;

const NOTHING_FOUND =
  'Your profile has no section covering that. Say so plainly rather than answering from general knowledge.';

export async function profileSearch(query: string): Promise<string> {
  if (!query.trim()) return 'Error: profile_search needs a "query" argument.';

  try {
    const [profile, config, index] = await Promise.all([
      getProfile(),
      getProfileConfig(),
      getProfileIndex(),
    ]);

    const result = await retrieveFromIndex(
      { embedModel: config.embedModel, markdown: profile.markdown, index },
      query,
      PROFILE_SEARCH_CHARS,
      embedQueryDirect,
    );

    if (!result.ok) {
      const { summary, hint } = diagnoseRetrievalFailure(result);
      return `Error: ${summary}. ${hint}`;
    }

    if (result.chunks.length === 0) return NOTHING_FOUND;

    // Each chunk's text already opens with its own `## Heading` (see `chunk.ts`), so the
    // citations ride along for free — the panel parses them back out to show what grounded
    // the reply. Same separator `answer-evidence.ts` uses.
    return result.chunks
      .slice(0, MAX_SECTIONS)
      .map((chunk) => chunk.text)
      .join('\n\n---\n\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
