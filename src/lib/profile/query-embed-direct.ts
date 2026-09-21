import { embedTexts } from '../ollama-embed';
import { getOllamaConfig, getProfileConfig } from '../storage';

/**
 * The worker's `QueryEmbedder`, the twin of `query-embed-port.ts`.
 *
 * Same reason that module exists: transport is its own reason to change, and keeping it out
 * of `profile-retrieval.ts` is what lets the refusal rules stay a pure function of their
 * inputs. The difference is which side of the port the caller sits on. The panel has to send
 * the query to the worker because only the worker makes outbound requests; a chat tool is
 * already running there, so it calls `/api/embed` directly and there is no round trip to fail.
 *
 * It never throws. `retrieveFromIndex` turns `{ ok: false }` into `{ reason: 'embed-failed' }`,
 * which `diagnoseRetrievalFailure` words for the user.
 */
export async function embedQueryDirect(
  query: string,
): Promise<{ ok: true; vector: number[] } | { ok: false; error: string }> {
  try {
    const { baseUrl } = await getOllamaConfig();
    const { embedModel } = await getProfileConfig();
    const [vector] = await embedTexts({ baseUrl, model: embedModel }, [query]);

    if (!vector) return { ok: false, error: 'Ollama returned no vector for the query' };
    return { ok: true, vector };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
