/**
 * Resolves which model the Workflows tab runs on.
 *
 * The Workflows tab keeps its own preference because drafting is the one path where a
 * weaker model fabricates experience — the eval picks a model for it specifically — while
 * chat may want a smaller, faster one. Storage holds only the bytes; this is where the
 * ''-means-fallback convention is interpreted for this surface.
 *
 * A deliberate twin of `news/summary-model.ts` rather than a shared helper. The line is
 * the same; the thing it decides is not, and each tab's header owns its own answer to
 * "which model runs this?". Change one and the other keeps its own behaviour.
 *
 * Note what this does *not* cover: the capture spends no generation at all, and the
 * embedding model is `profileConfig.embedModel`, a different endpoint entirely
 * (`ollama-embed.ts`). Only `DRAFT_ANSWER` and `EXTRACT_QUESTION_TIMES` read this.
 */

/**
 * '' (or whitespace) means follow the globally active model. Membership in the manual
 * model list is deliberately NOT checked — the active model may legitimately be absent
 * from it too, and ModelPicker surfaces an unlisted value anyway.
 */
export function resolveWorkflowModel(workflowModel: string, activeModel: string): string {
  return workflowModel.trim() || activeModel;
}
