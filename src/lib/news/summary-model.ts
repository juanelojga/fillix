/**
 * Resolves which model summarizes a News article.
 *
 * The News tab keeps its own preference so a small, fast model can summarize while chat
 * runs the largest one that fits. Storage holds only the bytes; this is where the
 * ''-means-fallback convention is interpreted for this surface — the same split as
 * system-prompt.ts. The Workflows tab has its own twin, `playbooks/workflow-model.ts`:
 * the line is the same, but each tab's header owns its own answer to what runs it.
 */

/**
 * '' (or whitespace) means follow the globally active model. Membership in the manual
 * model list is deliberately NOT checked — the active model may legitimately be absent
 * from it too, and ModelPicker surfaces an unlisted value anyway.
 */
export function resolveSummaryModel(newsModel: string, activeModel: string): string {
  return newsModel.trim() || activeModel;
}
