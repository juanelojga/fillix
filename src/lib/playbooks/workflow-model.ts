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
 * One preference for the tab, not one per playbook: the header holds a single picker, and a
 * per-playbook preference would make that one control mean different things depending on the
 * *other* picker beside it, with nothing on screen saying which. `removeModel` would also need
 * a second reconciliation arm, which is a second chance for a deleted model to survive as a
 * stale string.
 *
 * Note what this does *not* cover: the capture spends no generation at all, and the
 * embedding model is `profileConfig.embedModel`, a different endpoint entirely
 * (`ollama-embed.ts`). What reads this is Toptal's `DRAFT_ANSWER` and
 * `EXTRACT_QUESTION_TIMES`, and the composer's `POST_TOPICS`.
 */

/**
 * '' (or whitespace) means follow the globally active model. Membership in the manual
 * model list is deliberately NOT checked — the active model may legitimately be absent
 * from it too, and ModelPicker surfaces an unlisted value anyway.
 */
export function resolveWorkflowModel(workflowModel: string, activeModel: string): string {
  return workflowModel.trim() || activeModel;
}
