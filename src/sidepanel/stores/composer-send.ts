import type { MessageResponse } from '../../types';

/**
 * The composer's one way of talking to the service worker.
 *
 * Shared across the stage stores rather than copied into each, unlike `stores/news.ts`'s
 * private `send`: there the fallback wording and the narrowing belong to one store's own
 * message set, while here three stages send four messages with identical failure semantics.
 *
 * Never throws. A suspended MV3 worker is the ordinary case, not an exceptional one.
 *
 * The failure arm is re-validated rather than trusted. `sendMessage` is typed as returning
 * whatever the worker sent, but a worker from an older build — or one that threw before it
 * could word anything — answers with a shape that has no `error` at all, and every
 * diagnostics module in this codebase is a pure function of *strings*. Handing one
 * `undefined` crashes the panel on the path whose whole job is to report a failure.
 */
export async function send(message: unknown): Promise<MessageResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse | undefined;
    if (!response) return { ok: false, error: 'No response from the extension service worker' };
    if (!response.ok && typeof response.error !== 'string') {
      return { ok: false, error: 'The extension service worker failed without saying why' };
    }
    return response;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
