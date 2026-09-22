/**
 * The character and token budgets the composer's prompts are built against.
 *
 * One file because these numbers are only meaningful against each other — that is exactly
 * one reason to change. Spread across four call modules, each would restate `num_ctx: 8192`
 * beside its own copy of the arithmetic, and the first one edited would be the only one.
 *
 * The Stage 2 prompt is the largest and sets the ceiling:
 *
 *   voice spec      ~3.5 kB
 *   research         4.0 kB   RESEARCH_CHARS
 *   specifics        2.0 kB   SPECIFICS_CHARS
 *   topic and rules ~1.0 kB
 *   ------------------------
 *   ~10.5 kB  ≈ 3,100 tokens, plus BRIEF_NUM_PREDICT 1,024 ≈ 4,100 — inside POST_NUM_CTX.
 *
 * `POST_NUM_CTX` is passed explicitly on every call for `draft-answer.ts`'s reason: Ollama
 * defaults it to 2048 and truncates an overflowing context from the **start** without
 * saying so, which would silently eat the voice spec first — the one part of the prompt
 * that makes the post sound like the author.
 */
export const POST_NUM_CTX = 8_192;

/** The web + Hacker News evidence block handed to the brief. */
export const RESEARCH_CHARS = 4_000;

/**
 * The profile excerpts. A third of `answers/answer-evidence.ts`'s EVIDENCE_CHARS: a post
 * leans on one or two concrete moments, not a whole CV, and the research block is already
 * charged against the same context.
 */
export const SPECIFICS_CHARS = 2_000;
