import { embedTexts, type EmbedConfig } from '../../src/lib/ollama-embed';
import type { QueryEmbedder } from '../../src/lib/profile/profile-retrieval';

/**
 * The harness's half of the retrieval seam.
 *
 * The panel sends the query to the worker and gets a vector back; here the same call is made
 * directly. Everything after it — the refusals, the cosine ranking, the budget — is the shared
 * `retrieveFromIndex`, so what the eval scores is the production ranking, not a copy of it.
 */
export function ollamaQueryEmbedder(config: EmbedConfig): QueryEmbedder {
  return async (query: string) => {
    try {
      const [vector] = await embedTexts(config, [query]);
      if (!vector) return { ok: false, error: 'Embedding returned no rows' };
      return { ok: true, vector };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}
