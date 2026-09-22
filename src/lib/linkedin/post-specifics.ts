import { embedQueryDirect } from '../profile/query-embed-direct';
import { retrieveFromIndex } from '../profile/profile-retrieval';
import type { RetrievalFailure } from '../profile/retrieval-diagnostics';
import { getProfile, getProfileConfig, getProfileIndex } from '../storage';
import { SPECIFICS_CHARS } from './post-budget';
import { buildSpecificsQuery } from './post-query';
import type { PillarId } from './post-taxonomy';

/**
 * The author's own words about the topic — the un-fakeable specifics a post is built on.
 *
 * Worker-side, unlike `answers/answer-evidence.ts`. That one runs in the panel because the
 * panel holds the capture the query is built from and because scoring 40 chunks locally beats
 * shipping ~275 KB of floats through a port. Neither applies here: there is no capture, the
 * vectors are in `chrome.storage.local` which the worker reads just as well, and
 * `query-embed-direct.ts` is the worker's own embedder with no round trip to fail.
 *
 * The retrieval, the refusal rules and the separator are `profile/profile-retrieval.ts`'s, so
 * there is one set of rules rather than two that agree until they don't.
 */

const SEPARATOR = '\n\n---\n\n';

export interface PostSpecifics {
  /** The retrieved sections, headings included. '' when nothing could be retrieved. */
  text: string;
  /** The `##` headings, so the panel can show what the post drew on. */
  headings: string[];
  /** null when retrieval worked. Worded by `diagnoseRetrievalFailure` in the panel. */
  failure: RetrievalFailure | null;
}

/**
 * Never throws, and a refusal is not an error here.
 *
 * `stores/profile.ts` aborts a drafted application answer whenever the index cannot be
 * trusted, because an answer with no profile behind it is a lie told to a recruiter. A post
 * with no personal anecdote is only a weaker post — the research still grounds it, and the
 * audit still forces every claim onto a number. So a missing embed model, an empty profile, a
 * missing or stale index all yield `text: ''` with the reason attached, the post is written
 * anyway, and the panel says why it reads generic.
 */
export async function gatherPostSpecifics(
  topic: string,
  angle: string,
  pillar: PillarId,
): Promise<PostSpecifics> {
  try {
    const [profile, config, index] = await Promise.all([
      getProfile(),
      getProfileConfig(),
      getProfileIndex(),
    ]);

    const result = await retrieveFromIndex(
      { embedModel: config.embedModel, markdown: profile.markdown, index },
      buildSpecificsQuery(topic, angle, pillar),
      SPECIFICS_CHARS,
      embedQueryDirect,
    );

    if (!result.ok) return { text: '', headings: [], failure: result };

    return {
      text: result.chunks.map((chunk) => chunk.text).join(SEPARATOR),
      headings: result.chunks.map((chunk) => chunk.heading),
      failure: null,
    };
  } catch (err) {
    return {
      text: '',
      headings: [],
      failure: {
        reason: 'embed-failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
