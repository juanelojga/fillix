/**
 * Reads the JSON a model was asked to produce, and tells apart the two ways that fails.
 *
 * Split out of `ollama.ts` because it answers a question that client does not: *why* a reply is
 * unreadable. With `format: 'json'` the sampler is grammar-constrained, so a generation that runs
 * to completion is valid JSON by construction — an unterminated object means the model stopped
 * early, which is a different failure with a different next step from "the model ignored the
 * format instruction". Ollama says which happened in `done_reason`, and until this module existed
 * that answer was read off the wire and thrown away.
 */

/**
 * How much of an unreadable reply to quote back. Head *and* tail, because a cut-off reply's
 * interesting part is the end: the previous head-only slice is the reason this failure went
 * undiagnosed for as long as it did — every report of it showed the same confident opening
 * sentence and nothing about where the model actually stopped.
 */
const RAW_HEAD_CHARS = 200;
const RAW_TAIL_CHARS = 120;

/**
 * One line, whitespace collapsed. Both matter: the message's own newline is structural (see
 * below), and a three-paragraph answer would otherwise render as a wall in a 400px panel.
 */
export function describeRawReply(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (flat.length <= RAW_HEAD_CHARS + RAW_TAIL_CHARS) return `raw ${raw.length} chars · ${flat}`;
  const head = flat.slice(0, RAW_HEAD_CHARS);
  const tail = flat.slice(-RAW_TAIL_CHARS);
  return `raw ${raw.length} chars · head: ${head}… · tail: …${tail}`;
}

/**
 * The two-line shape is load-bearing, not formatting.
 *
 * Line 1 is the cause, and is the only line `answers/draft-diagnostics.ts` and
 * `news/summary-diagnostics.ts` match their regexes against. Line 2 is verbatim model output, and
 * it has to stay out of reach of those regexes: an application answer reading "I fixed a request
 * timeout in the checkout service" would otherwise be diagnosed as Ollama timing out, and one
 * mentioning "not found" as a missing model. Never put a diagnosable phrase on line 2, and never
 * put raw model text on line 1.
 */
function replyError(cause: string, raw: string): Error {
  return new Error(`${cause}\n${describeRawReply(raw)}`);
}

/**
 * The error a cut-off reply throws. Exported so `ollama.ts` can name the same cause on its
 * empty-response path, where a reasoning model spends its whole budget before writing an answer.
 */
export function cutOffError(raw: string, doneReason?: string): Error {
  const why = doneReason ? `done_reason "${doneReason}"` : 'the reply ends mid-object';
  return replyError(`Model output was cut off before it finished the JSON (${why})`, raw);
}

/**
 * `doneReason` is Ollama's own `done_reason` from the same reply — `'stop'` when the model
 * finished, `'length'` when it hit the prediction or context limit. Deliberately a bare
 * `string | undefined` rather than a closed union: `'unload'` also exists, older servers omit the
 * field, and a stale union would be a claim about a wire format we do not own.
 */
export function parseStructuredReply<T>(raw: string, doneReason?: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Parse first, classify second, and never the other way round: a model can finish a complete
    // object and only then hit the cap, so `done_reason === 'length'` on its own is not a failure.
    // Gating on it before parsing would turn working drafts into red cards.
    const stripped = raw
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as T;
      } catch {
        // fall through
      }
    }

    if (doneReason === 'length') throw cutOffError(raw, doneReason);

    // No `done_reason` to go on — older servers omit it. An object that opens and never closes is
    // a prefix as a matter of fact rather than a guess, so it is still named as one; anything else
    // is reported as malformed, which is what this did for every reply before.
    if (stripped.startsWith('{') && !stripped.includes('}')) throw cutOffError(raw);

    throw replyError('Model returned invalid JSON', raw);
  }
}
