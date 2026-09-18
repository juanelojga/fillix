import type { Message, MessageResponse } from '../../types';

/**
 * The `PROFILE_QUERY` round trip, as its own module.
 *
 * Transport changes for entirely different reasons than the retrieval rules do — a port that
 * can be suspended, a response whose shape is a compile-time claim about JSON. Keeping it here
 * is what lets `profile-retrieval.ts` stay a pure function of its inputs.
 *
 * Only the query crosses the port. The vectors are already in the panel.
 */
export async function embedQueryInWorker(
  query: string,
): Promise<{ ok: true; vector: number[] } | { ok: false; error: string }> {
  const msg: Message = { type: 'PROFILE_QUERY', query };
  const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;

  if (!response) return { ok: false, error: 'No response from the extension service worker' };
  if (!response.ok) return { ok: false, error: response.error };
  if (!('queryVector' in response)) return { ok: false, error: 'Unexpected response shape' };

  return { ok: true, vector: response.queryVector };
}
